import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceBySlug } from '@/lib/workspaces/service';
import { resolveWorkspaceAsset } from '@/lib/system-assets';

/**
 * 模板解析编排（template-parser Skill 的运行时入口）。
 * 输入：剪映人工母版草稿目录（用户可在对话中指定）
 * 输出：<workspace templateRoot>/<templateId>/template-asset.json + source/ 母版明文
 *
 * 对应 CLI：zhiheng-template-cli parse（开发机 python / 桌面 bundled EXE）。
 */
export interface TemplateParseParams {
  workspaceSlug: string;
  /** 剪映草稿目录（绝对路径） */
  draftDir: string;
  /** 可选：模板 ID（缺省自动生成） */
  templateId?: string;
  /** 可选：模板名称 */
  templateName?: string;
}

export interface TemplateParseResult {
  ok: boolean;
  templateId?: string;
  templateName?: string;
  assetPath?: string;
  sourceDir?: string;
  textSlotCount?: number;
  mediaSlotCount?: number;
  output?: string;
  error?: string;
}

const CLI_PYTHON =
  process.env.ZHIJING_TEMPLATE_CLI ||
  process.env.ZHIJING_PYTHON ||
  'D:\\剪映智剪测试\\poc-venv\\Scripts\\python.exe';
const PIPELINE_DIR =
  process.env.ZHIHENG_TEMPLATE_PIPELINE_DIR || 'D:\\知衡智企\\scripts\\template-pipeline';

function buildParseArgs(
  draftDir: string,
  templateId: string,
  outAssetDir: string,
  templateName: string
): { cli: string; args: string[] } {
  const cli = CLI_PYTHON.trim();
  // 判断是否为打包后的独立 CLI EXE（zhiheng-template-cli.exe）。
  // 注意：不能按 .exe 后缀判断——python.exe 也是 .exe，但它是解释器，
  // 必须把 zhiheng-template-cli.py 作为脚本参数传给它。
  const isBundledCli = /zhiheng-template-cli\.exe$/i.test(cli);
  const args = isBundledCli
    ? [cli, 'parse', draftDir, templateId, outAssetDir, templateName]
    : [
        cli,
        path.join(PIPELINE_DIR, 'zhiheng-template-cli.py'),
        'parse',
        draftDir,
        templateId,
        outAssetDir,
        templateName
      ];
  return { cli: args[0], args: args.slice(1) };
}

async function runCommand(
  draftDir: string,
  templateId: string,
  outAssetDir: string,
  templateName: string
): Promise<{ ok: boolean; output: string; error?: string }> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileP = promisify(execFile);
  const { cli, args } = buildParseArgs(draftDir, templateId, outAssetDir, templateName);
  try {
    // 不经 cmd.exe：避免中文参数被 GBK 转码乱码
    const { stdout, stderr } = await execFileP(cli, args, {
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    const merged = [stdout, stderr].filter(Boolean).join('\n');
    if (stdout.includes('parse 完成') || stdout.includes('文字槽')) {
      return { ok: true, output: merged };
    }
    return { ok: false, output: merged, error: merged || '模板解析失败' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: message, error: message };
  }
}

export async function runTemplateParse(params: TemplateParseParams): Promise<TemplateParseResult> {
  const workspace = getWorkspaceBySlug(params.workspaceSlug);
  if (!workspace) return { ok: false, error: '工作空间不存在' };

  const draftDir = params.draftDir.trim().replace(/^"|"$/g, '');
  if (!fs.existsSync(draftDir)) return { ok: false, error: `草稿目录不存在: ${draftDir}` };
  if (!fs.existsSync(path.join(draftDir, 'draft_content.json'))) {
    return { ok: false, error: `目录不是剪映草稿（缺少 draft_content.json）: ${draftDir}` };
  }

  // 草稿名 → 模板 ID
  const draftName = path.basename(draftDir);
  const slug = draftName
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const templateId =
    params.templateId ??
    `draft-${slug || Date.now().toString(36)}-${Date.now().toString(36).slice(-4)}`;
  const templateName = params.templateName || draftName;

  try {
    const tplRoot = (await resolveWorkspaceAsset(workspace.id, 'templateRoot')).path;
    // 统一输出到「企业模板」子目录：用户在企业知识库的企业模板文件夹中直接可见
    const outAssetDir = path.join(tplRoot, '企业模板', templateId);
    const r = await runCommand(draftDir, templateId, outAssetDir, templateName);
    const assetPath = path.join(outAssetDir, 'template-asset.json');
    // 判定兑底：不依赖 stdout 文本（控制台编码可能影响），输出文件生成即成功
    if (!r.ok && !fs.existsSync(assetPath)) {
      return { ok: false, error: r.error, output: r.output };
    }

    let textSlotCount: number | undefined;
    let mediaSlotCount: number | undefined;
    try {
      const asset = JSON.parse(fs.readFileSync(assetPath, 'utf-8'));
      textSlotCount = asset.textSlots?.length ?? 0;
      mediaSlotCount = asset.mediaSlots?.length ?? 0;
    } catch {
      /* 统计失败不阻断 */
    }
    return {
      ok: true,
      templateId,
      templateName,
      assetPath,
      sourceDir: path.join(outAssetDir, 'source'),
      textSlotCount,
      mediaSlotCount,
      output: r.output
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
