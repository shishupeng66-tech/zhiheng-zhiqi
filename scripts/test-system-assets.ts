/**
 * System Asset Registry + Path Resolver 综合测试
 * 用法：npx tsx scripts/test-system-assets.ts
 *
 * 覆盖：默认路径解析 / DB override / ENV override / Windows绝对路径 /
 *       UNC路径 / 不存在目录 / ensure创建 / workspace asset / invalid key / writable probe
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  resolveSystemAsset,
  resolveWorkspaceAsset,
  ensureSystemAsset,
  inspectSystemAssets,
  getDefaultSystemAssetPaths,
  getLegacySystemAssetPaths
} from '../src/lib/system-assets';
import { getDb, runMigrations } from '../src/lib/db';
import { storageConfigs } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.error(`  FAIL: ${msg}`);
  }
}

async function cleanupDbOverride(key: string) {
  const db = getDb();
  await db.delete(storageConfigs).where(eq(storageConfigs.storageKey as any, `system_asset:${key}`));
}

async function main() {
  console.log('=== System Asset Registry Tests ===\n');
  runMigrations();

  // ---- 1. 默认路径解析 ----
  console.log('1. 默认路径解析');
  const defaults = getDefaultSystemAssetPaths();
  assert(defaults.styleKnowledgeRoot.includes('05_视频剪辑知识'), 'styleKnowledgeRoot 默认指向 Obsidian 05_视频剪辑知识');
  assert(defaults.jianyingTemplateRoot.includes('剪映模板库'), 'jianyingTemplateRoot 默认含 剪映模板库');
  assert(defaults.visualResourceRegistryRoot.includes('视觉资源库'), 'visualResourceRegistryRoot 默认含 视觉资源库');
  assert(defaults.editingSkillRoot.includes('Skills'), 'editingSkillRoot 默认含 Skills');
  const r1 = await resolveSystemAsset('styleKnowledgeRoot');
  assert(r1.exists === true, 'styleKnowledgeRoot 解析存在（legacy fallback）');
  assert(r1.source === 'DEFAULT', 'styleKnowledgeRoot source=DEFAULT');
  assert(r1.path.length > 0, 'styleKnowledgeRoot path 非空');

  // ---- 2. ENV override ----
  console.log('\n2. ENV override');
  const tmpEnvDir = path.join(os.tmpdir(), `zhiheng-env-test-${Date.now()}`);
  fs.mkdirSync(tmpEnvDir, { recursive: true });
  process.env.ZHI_HENG_SYSTEM_ASSET_EDITINGSKILLROOT = tmpEnvDir;
  const r2 = await resolveSystemAsset('editingSkillRoot');
  assert(r2.path === tmpEnvDir, `ENV override 生效: ${r2.path} === ${tmpEnvDir}`);
  assert(r2.source === 'ENV', 'ENV override source=ENV');
  assert(r2.exists === true, 'ENV override 目录存在');
  assert(r2.writable === true, 'ENV override 目录可写');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_EDITINGSKILLROOT;
  fs.rmdirSync(tmpEnvDir);

  // ---- 3. DB override ----
  console.log('\n3. DB override');
  const tmpDbDir = path.join(os.tmpdir(), `zhiheng-db-test-${Date.now()}`);
  fs.mkdirSync(tmpDbDir, { recursive: true });
  const db = getDb();
  await db.insert(storageConfigs).values({
    id: `test-override-${Date.now()}`,
    storageKey: 'system_asset:jianyingTemplateRoot' as any,
    storagePath: tmpDbDir,
    storageType: 'local',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const r3 = await resolveSystemAsset('jianyingTemplateRoot');
  assert(r3.path === tmpDbDir, `DB override 生效: ${r3.path}`);
  assert(r3.source === 'DATABASE', 'DB override source=DATABASE');
  await cleanupDbOverride('jianyingTemplateRoot');
  fs.rmdirSync(tmpDbDir);

  // ---- 4. Windows D盘绝对路径 ----
  console.log('\n4. Windows D盘绝对路径');
  const dPath = 'D:\\知衡智企数据库\\知识库\\05_视频剪辑知识';
  process.env.ZHI_HENG_SYSTEM_ASSET_STYLEKNOWLEDGEROOT = dPath;
  const r4 = await resolveSystemAsset('styleKnowledgeRoot');
  assert(r4.path === dPath, 'D盘绝对路径解析正确');
  assert(r4.exists === true, 'D盘路径存在');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_STYLEKNOWLEDGEROOT;

  // ---- 5. UNC 路径 ----
  console.log('\n5. UNC 路径（解析不报错）');
  const uncPath = '\\\\server\\share\\assets\\test';
  process.env.ZHI_HENG_SYSTEM_ASSET_RESOURCEINDEXROOT = uncPath;
  const r5 = await resolveSystemAsset('resourceIndexRoot');
  assert(r5.path === uncPath, 'UNC 路径解析正确');
  assert(r5.exists === false, 'UNC 不存在目录 exists=false（不抛异常）');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_RESOURCEINDEXROOT;

  // ---- 6. 不存在目录 ----
  console.log('\n6. 不存在目录');
  const missingPath = 'D:\\nonexistent\\path\\for\\testing\\12345';
  process.env.ZHI_HENG_SYSTEM_ASSET_RESOURCECALIBRATIONROOT = missingPath;
  const r6 = await resolveSystemAsset('resourceCalibrationRoot');
  assert(r6.exists === false, '不存在目录 exists=false');
  assert(r6.writable === false, '不存在目录 writable=false');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_RESOURCECALIBRATIONROOT;

  // ---- 7. ensure 创建 ----
  console.log('\n7. ensure 创建目录');
  const ensureDir = path.join(os.tmpdir(), `zhiheng-ensure-test-${Date.now()}`);
  process.env.ZHI_HENG_SYSTEM_ASSET_RESOURCEINDEXROOT = ensureDir;
  assert(!fs.existsSync(ensureDir), 'ensure 前目录不存在');
  const r7 = await ensureSystemAsset('resourceIndexRoot');
  assert(r7.exists === true, 'ensure 后目录存在');
  assert(r7.writable === true, 'ensure 后目录可写');
  assert(fs.existsSync(ensureDir), '文件系统确认目录已创建');
  fs.rmdirSync(ensureDir);
  delete process.env.ZHI_HENG_SYSTEM_ASSET_RESOURCEINDEXROOT;

  // ---- 8. workspace asset resolve ----
  console.log('\n8. workspace asset resolve');
  const workspaces = await db.select().from((await import('../src/lib/db/schema')).workspaces).limit(1);
  if (workspaces.length > 0) {
    const wsId = workspaces[0].id;
    const r8 = await resolveWorkspaceAsset(wsId, 'materialRoot');
    assert(r8.key === 'materialRoot', 'workspace asset key 正确');
    assert(r8.path.length > 0, 'workspace asset path 非空');
    assert(['DATABASE', 'DEFAULT', 'WORKSPACE'].includes(r8.source), `workspace asset source 合法: ${r8.source}`);
  } else {
    console.log('  SKIP: 无 workspace 数据');
  }

  // ---- 9. invalid key 运行时错误 ----
  console.log('\n9. invalid key（类型约束在编译期；运行时传任意字符串）');
  // 运行时传入非法 key（TypeScript 编译期 SystemAssetKey 类型会拒绝，这里 as any 模拟运行时）
  const r9 = await resolveSystemAsset('nonexistentKey' as any);
  assert(r9.key === 'nonexistentKey', '运行时非法 key 仍返回对象（不崩溃）');
  // TypeScript 编译期会拒绝非法 key，这是类型约束的价值

  // ---- 10. writable probe ----
  console.log('\n10. writable probe');
  const writableDir = path.join(os.tmpdir(), `zhiheng-writable-test-${Date.now()}`);
  fs.mkdirSync(writableDir, { recursive: true });
  process.env.ZHI_HENG_SYSTEM_ASSET_RESOURCECALIBRATIONROOT = writableDir;
  const r10 = await resolveSystemAsset('resourceCalibrationRoot');
  assert(r10.writable === true, '临时目录 writable=true');
  fs.rmdirSync(writableDir);
  delete process.env.ZHI_HENG_SYSTEM_ASSET_RESOURCECALIBRATIONROOT;

  // ---- 11. inspectSystemAssets ----
  console.log('\n11. inspectSystemAssets 诊断');
  const all = await inspectSystemAssets();
  assert(all.length === 6, `inspect 返回 6 个资产（实际 ${all.length}）`);
  const keys = all.map((a) => a.key);
  assert(keys.includes('styleKnowledgeRoot'), '包含 styleKnowledgeRoot');
  assert(keys.includes('editingSkillRoot'), '包含 editingSkillRoot');

  // ---- 12. legacy fallback ----
  console.log('\n12. legacy fallback（默认布局不存在时回退现有实际目录）');
  const legacy = getLegacySystemAssetPaths();
  assert(legacy.styleKnowledgeRoot === 'D:\\知衡智企数据库\\知识库\\05_视频剪辑知识', 'legacy styleKnowledge 路径正确');
  assert(legacy.jianyingTemplateRoot.includes('剪映模板库'), 'legacy template 路径指向 Production（不 fallback Research）');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.error('Failures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
