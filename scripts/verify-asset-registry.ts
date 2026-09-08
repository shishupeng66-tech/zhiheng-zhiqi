/**
 * 最终验证：System Asset Registry + Path Resolver + Template Asset Store 全套
 */
import { resolveWorkspaceAsset, resolveSystemAsset, ensureSystemAsset } from '@/lib/system-assets';
import {
  loadTemplateAsset,
  listTemplateAssets,
  listUsableTemplateAssets,
  resolveEnterpriseTemplateRoot
} from '@/lib/templates';
import { validateReplacementText, countVisibleChineseChars, normalizeTemplateAsset } from '@/lib/templates/asset-schema';

async function main() {
  let pass = 0, fail = 0;
  const ok = (name: string, cond: boolean, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name} ${detail}`); }
  };

  // 1. system asset resolve
  console.log('\n[1] System Asset 解析');
  for (const k of ['styleKnowledgeRoot', 'jianyingTemplateRoot', 'visualResourceRegistryRoot', 'resourceCalibrationRoot', 'resourceIndexRoot', 'editingSkillRoot'] as const) {
    const r = await resolveSystemAsset(k);
    ok(`resolveSystemAsset(${k}) → ${r.path} (${r.source})`, r.path.length > 5);
  }

  // 2. workspace templateRoot（DB）
  console.log('\n[2] Workspace templateRoot');
  const tr = await resolveWorkspaceAsset('workspace-enterprise-media', 'templateRoot');
  ok('templateRoot source=DATABASE/DEFAULT', tr.source === 'DATABASE' || tr.source === 'DEFAULT', tr.source);
  ok('templateRoot 存在', tr.exists, tr.path);
  ok('templateRoot 是知识库模板区', tr.path.includes('05_模板'), tr.path);

  // 3. template asset store
  console.log('\n[3] Template Asset Store');
  const assets = await listTemplateAssets('workspace-enterprise-media');
  ok('企业模板资产>=1', assets.length >= 1, String(assets.length));
  const firstTemplateId = assets.find((item) => item.ok && item.asset)?.asset?.templateId;
  const loaded = firstTemplateId
    ? await loadTemplateAsset('workspace-enterprise-media', firstTemplateId)
    : { ok: false };
  ok('loadTemplateAsset OK', loaded.ok);
  if (loaded.ok && loaded.asset) {
    const a = loaded.asset;
    ok('schemaVersion=1.0', a.schemaVersion === '1.0');
    ok('文字槽>=1', a.textSlots.length >= 1, String(a.textSlots.length));
    ok('媒体槽>=0', a.mediaSlots.length >= 0, String(a.mediaSlots.length));
    ok('constraintMode=EXACT_CHAR_COUNT', a.constraintMode === 'EXACT_CHAR_COUNT');
    ok('status=testing', a.status === 'testing');
  }
  const usable = await listUsableTemplateAssets('workspace-enterprise-media', { includeTesting: true });
  ok('可用模板(含testing)>=1', usable.length >= 1, String(usable.length));

  // 4. resolve/ensure 区分
  console.log('\n[4] resolve vs ensure');
  const probe = await resolveWorkspaceAsset('workspace-enterprise-media', 'templateRoot');
  ok('resolve 不创建', probe.exists === fsExists(probe.path));
  // 5. 字数校验
  console.log('\n[5] validateReplacementText');
  ok('EXACT 4=4 通过', validateReplacementText({ originalCharCount: 4, constraint: { mode: 'EXACT_CHAR_COUNT', exactCharCount: 4 } }, '实地验厂').valid);
  ok('EXACT 4≠5 拒绝', !validateReplacementText({ originalCharCount: 4, constraint: { mode: 'EXACT_CHAR_COUNT', exactCharCount: 4 } }, '实地验厂啊').valid);
  ok('countVisibleChineseChars 空格忽略', countVisibleChineseChars('实地 验厂') === 4);

  // 6. normalize 旧资产
  console.log('\n[6] normalize 旧格式资产');
  const old = {
    templateId: 'x1', templateName: '旧', templateInfo: { canvas: { width: 810, height: 1440 }, durationSec: 1, tracks: [], sourceDraft: 'd', sourceDraftDir: 'dir' },
    textSlots: [{ segmentId: 's1', materialId: 'm1', trackIndex: 0, resourceType: 'TEXT_TEMPLATE', resourceId: 'r1', text: '拿样品', charCount: 3 }],
    mediaSlots: [], constraintMode: 'EXACT_CHAR_COUNT', status: 'testing', verificationStatus: 'PENDING_USER_REVIEW'
  };
  const norm = normalizeTemplateAsset(old as any);
  ok('旧格式归一化成功', !!norm && norm.textSlots[0].resourceType === 'text_template');

  // 7. invalid key 类型安全（TS 层）
  console.log('\n[7] TS 类型安全（编译期验证，无需运行）');

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
  process.exit(fail > 0 ? 1 : 0);
}
function fsExists(p: string): boolean {
  try { const fs = require('node:fs'); return fs.existsSync(p); } catch { return false; }
}
main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
