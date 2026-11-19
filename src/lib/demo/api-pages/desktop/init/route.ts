import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { runMigrations, getDb } from '@/lib/db';
import { findUserByUsername, createUser } from '@/services/users';
import { ensureDefaultWorkspacesSeed } from '@/lib/workspaces/service';
import { saveConfig } from '@/lib/storage';
import { applyModuleConfig } from '@/lib/settings/store';
import { eq, and } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';

/**
 * 桌面首次初始化（幂等）：
 *   1. 应用 DB 迁移（./drizzle 已随包）
 *   2. 创建超级管理员（INITIAL_ADMIN_*，来自桌面首次向导传入；无明文落盘日志）
 *   3. 种子默认工作空间（enterprise-media）
 *   4. 可选：写入客户素材根目录（assets storage config）
 */

/**
 * 安全递归拷贝（规避 Node fs.cpSync 在 Windows 上对含视频目录的原生崩溃，
 * 仅使用逐文件 copyFileSync，行为与 prepare-runtime 装配一致）。
 */
function copyDirSyncSafe(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, e.name);
    const dp = path.join(dest, e.name);
    if (e.isDirectory()) copyDirSyncSafe(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || process.env.INITIAL_ADMIN_USERNAME || 'admin').trim();
  const password = String(body.password || process.env.INITIAL_ADMIN_PASSWORD || '');
  const name = String(body.name || process.env.INITIAL_ADMIN_NAME || '系统管理员').trim();
  const employeeNo = String(
    body.employeeNo || process.env.INITIAL_ADMIN_EMPLOYEE_NO || 'A0001'
  ).trim();
  const materialRoot = typeof body.materialRoot === 'string' ? body.materialRoot.trim() : '';

  const steps: Array<{ key: string; ok: boolean; detail: string }> = [];

  try {
    runMigrations();
    steps.push({ key: 'migrations', ok: true, detail: 'DB 迁移完成' });
  } catch (err) {
    steps.push({ key: 'migrations', ok: false, detail: (err as Error).message });
  }

  let adminId = '';
  try {
    const existing = await findUserByUsername(username);
    if (existing) {
      adminId = existing.id;
      steps.push({ key: 'admin', ok: true, detail: `超级管理员已存在 id=${adminId}` });
    } else {
      if (!password || password.length < 8) {
        throw new Error('初始密码至少 8 位（仅首次初始化需要）');
      }
      const admin = await createUser({
        username,
        name,
        employeeNo,
        password,
        role: 'super_admin',
        status: 'active',
        mustChangePassword: true
      });
      adminId = admin.id;
      steps.push({ key: 'admin', ok: true, detail: `超级管理员创建成功 id=${adminId}` });
    }
  } catch (err) {
    steps.push({ key: 'admin', ok: false, detail: (err as Error).message });
  }

  try {
    ensureDefaultWorkspacesSeed();
    steps.push({ key: 'workspaces', ok: true, detail: '默认工作空间种子完成（enterprise-media）' });
  } catch (err) {
    steps.push({ key: 'workspaces', ok: false, detail: (err as Error).message });
  }

  // 管理员加入 enterprise-media 工作空间（确保 golden 链路可用）
  if (adminId) {
    try {
      const db = getDb();
      const ws = db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.slug, 'enterprise-media'))
        .get();
      if (ws) {
        const existing = db
          .select()
          .from(schema.workspaceMembers)
          .where(
            and(
              eq(schema.workspaceMembers.workspaceId, ws.id),
              eq(schema.workspaceMembers.userId, adminId)
            )
          )
          .get();
        if (!existing) {
          db.insert(schema.workspaceMembers)
            .values({
              id: crypto.randomUUID(),
              workspaceId: ws.id,
              userId: adminId,
              role: 'admin',
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .run();
        }
        steps.push({ key: 'membership', ok: true, detail: `管理员已加入 ${ws.slug}` });
      }
    } catch (err) {
      steps.push({ key: 'membership', ok: false, detail: (err as Error).message });
    }
  }

  if (materialRoot) {
    try {
      await saveConfig('assets', materialRoot);
      // 素材根缺少索引时，自动部署随包黄金测试素材（videos/ + 索引）
      const indexPath = path.join(materialRoot, 'video-assets-detailed.json');
      if (!fs.existsSync(indexPath)) {
        const goldenSrc = process.env.ZHIHENG_GOLDEN_ASSETS || '';
        if (goldenSrc && fs.existsSync(goldenSrc)) {
          copyDirSyncSafe(goldenSrc, materialRoot);
          steps.push({
            key: 'golden_deploy',
            ok: fs.existsSync(indexPath),
            detail: fs.existsSync(indexPath)
              ? `已部署随包黄金测试素材 → ${materialRoot}`
              : '黄金素材部署失败'
          });
        } else {
          steps.push({
            key: 'golden_deploy',
            ok: true,
            detail: '素材根已有索引或未携带黄金素材，跳过部署'
          });
        }
      } else {
        steps.push({ key: 'golden_deploy', ok: true, detail: '素材根已存在索引，保留用户素材' });
      }
      steps.push({ key: 'material_root', ok: true, detail: `素材根目录已配置: ${materialRoot}` });
    } catch (err) {
      steps.push({ key: 'material_root', ok: false, detail: (err as Error).message });
    }
  }

  // LLM 配置（应用自身加密通道写入；明文仅经本机 localhost 传递，不落日志）
  const llm = body.llmConfig;
  if (llm && typeof llm === 'object') {
    try {
      const baseUrl = String(llm.baseUrl || '').trim();
      const apiKey = String(llm.apiKey || '').trim();
      const model = String(llm.model || '').trim();
      if (baseUrl && apiKey && model) {
        await applyModuleConfig('llm', [
          {
            provider: 'volcengine-ark',
            enabled: true,
            isDefault: true,
            fields: [
              { key: 'base_url', value: baseUrl, isSecret: false, changed: true },
              { key: 'api_key', value: apiKey, isSecret: true, changed: true },
              { key: 'model', value: model, isSecret: false, changed: true }
            ]
          }
        ]);
        steps.push({
          key: 'llm_config',
          ok: true,
          detail: `LLM 配置已保存（provider=volcengine-ark model=${model}）`
        });
      } else {
        steps.push({
          key: 'llm_config',
          ok: false,
          detail: 'LLM 配置不完整（baseUrl/apiKey/model 必填）'
        });
      }
    } catch (err) {
      steps.push({ key: 'llm_config', ok: false, detail: (err as Error).message });
    }
  } else {
    steps.push({
      key: 'llm_config',
      ok: true,
      detail: '跳过（未提供 LLM 配置，可在首次向导或系统设置中填写）'
    });
  }

  const ok = steps.every((s) => s.ok);
  return NextResponse.json({ ok, adminId, steps });
}
