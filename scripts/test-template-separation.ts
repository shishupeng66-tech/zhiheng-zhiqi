/**
 * Template Library Separation 测试（Research vs Production 物理隔离）
 * 用法：npx tsx scripts/test-template-separation.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadTemplateRegistry,
  listTemplates,
  listApprovedTemplates,
  listTestingTemplates,
  getTemplate,
  inspectTemplateLibrary,
  promoteResearchTemplate,
  TEMPLATE_REGISTRY_ERROR
} from '../src/lib/templates';
import { resolveSystemAsset } from '../src/lib/system-assets';
import { RESEARCH_TEMPLATE_ROOT } from '../src/lib/system-assets/defaults';
import { runMigrations } from '../src/lib/db';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

async function main() {
  runMigrations();
  console.log('=== Template Library Separation Tests ===\n');

  // 1. Production Root resolve
  console.log('1. Production Root resolve');
  const resolved = await resolveSystemAsset('jianyingTemplateRoot');
  assert(resolved.path === 'D:\\知衡智企数据库\\知识库\\05_模板\\剪映模板库',
    `jianyingTemplateRoot = Production 路径（实际: ${resolved.path}）`);
  assert(resolved.exists === true, 'Production 根目录存在');
  assert(resolved.source === 'DEFAULT', `source=DEFAULT（实际: ${resolved.source}）`);
  console.log(`    resolved path: ${resolved.path}`);

  // 2. Research Root != Production Root（研究库已删除）
  console.log('\n2. Research Root 已删除（不与 Production 混淆）');
  assert(RESEARCH_TEMPLATE_ROOT === '',
    `Research Root 已移除（实际: "${RESEARCH_TEMPLATE_ROOT}"）`);
  assert(RESEARCH_TEMPLATE_ROOT !== resolved.path, 'Research Root ≠ Production Root（物理隔离）');

  // 3. Production registry load
  console.log('\n3. Production registry load');
  const reg = await loadTemplateRegistry();
  assert(reg.registryExists === true, 'registry.json 存在');
  assert(reg.registryValid === true, 'registry 有效');
  assert(reg.error === undefined, '无错误');
  assert(reg.rootPath === resolved.path, 'rootPath 指向 Production');

  // 4. 当前 1 个 testing template
  console.log('\n4. 当前 Production 模板');
  const all = await listTemplates();
  assert(all.length === 1, `模板数量=1（实际 ${all.length}）`);
  assert(all[0].status === 'testing', `状态=testing（实际 ${all[0].status}）`);
  assert(all[0].templateId === 'zhiheng-product-e2e-v1', `templateId 正确`);
  assert(all[0].sourceType === 'zhiheng_created', `sourceType=zhiheng_created`);

  // 5. approved=0, testing=1
  console.log('\n5. 状态过滤');
  const approved = await listApprovedTemplates();
  assert(approved.length === 0, `approved=0（实际 ${approved.length}）`);
  const testing = await listTestingTemplates();
  assert(testing.length === 1, `testing=1（实际 ${testing.length}）`);

  // 6. Research 729 套不出现在 listTemplates
  console.log('\n6. Research 729 套不出现');
  const allTpls = await listTemplates();
  // Research 模板通常 sourceType=imported 或 templateId 以 tpl- 开头；Production 只有 1 个 zhiheng_created
  const researchIds = allTpls.filter((t) =>
    t.sourceType === 'imported' || t.templateId.startsWith('tpl-') || t.templateId.startsWith('research-')
  );
  assert(researchIds.length === 0, '无第三方研究模板混入 Production');
  assert(allTpls.every((t) => t.sourceType === 'zhiheng_created' || t.sourceType === undefined),
    '所有模板 sourceType 为 zhiheng_created 或未设置');

  // 7. Registry missing → empty（不崩溃）
  console.log('\n7. Registry missing → empty');
  const tmpDir = path.join(os.tmpdir(), `zhiheng-prod-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT = tmpDir;
  const missingReg = await loadTemplateRegistry();
  assert(missingReg.registryExists === false, 'registry 不存在时 registryExists=false');
  assert(missingReg.templates.length === 0, '模板为空');
  assert(missingReg.registryValid === true, 'registryValid=true（不存在不算损坏）');

  // 8. Registry invalid → explicit error（REGISTRY_INVALID）
  console.log('\n8. Registry invalid → REGISTRY_INVALID');
  fs.writeFileSync(path.join(tmpDir, 'registry.json'), '{invalid json!!!', 'utf8');
  const invalidReg = await loadTemplateRegistry();
  assert(invalidReg.registryExists === true, 'registry 文件存在');
  assert(invalidReg.registryValid === false, 'registryValid=false');
  assert(invalidReg.error === TEMPLATE_REGISTRY_ERROR.REGISTRY_INVALID,
    `error=REGISTRY_INVALID（实际 ${invalidReg.error}）`);
  assert(invalidReg.templates.length === 0, '损坏时模板为空（不 fallback）');

  // 9. 不 fallback research（即使 Production 损坏也不读 Research）
  console.log('\n9. 不 fallback Research');
  assert(invalidReg.rootPath === tmpDir, 'rootPath 仍指向 Production（不跳到 Research）');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT;
  fs.unlinkSync(path.join(tmpDir, 'registry.json'));
  fs.rmdirSync(tmpDir);

  // 10. Template lookup
  console.log('\n10. Template lookup');
  const found = await getTemplate('zhiheng-product-e2e-v1');
  assert(found !== null, 'getTemplate 找到');
  assert(!!found && found.draftPath.includes('ZHIHENG-PRODUCT-E2E-V1'), 'draftPath 指向黄金草稿');
  const notFound = await getTemplate('nonexistent');
  assert(notFound === null, '不存在的 ID 返回 null');

  // 11. inspectTemplateLibrary
  console.log('\n11. inspectTemplateLibrary');
  const inspect = await inspectTemplateLibrary();
  assert(inspect.root === 'D:\\知衡智企数据库\\知识库\\05_模板\\剪映模板库', `inspect.root=Production（实际 ${inspect.root}）`);
  assert(inspect.exists === true, 'root 存在');
  assert(inspect.writable === true, 'root 可写');
  assert(inspect.registryExists === true, 'registry 存在');
  assert(inspect.registryValid === true, 'registry 有效');
  assert(inspect.templateCount === 1, `templateCount=1（实际 ${inspect.templateCount}）`);
  assert(inspect.approvedCount === 0, 'approvedCount=0');
  assert(inspect.testingCount === 1, 'testingCount=1');
  assert(inspect.draftCount === 0, 'draftCount=0');
  assert(inspect.disabledCount === 0, 'disabledCount=0');
  assert(inspect.researchRoot === RESEARCH_TEMPLATE_ROOT, 'researchRoot 字段正确（仅参考，不读取）');

  // 12. sourceType
  console.log('\n12. sourceType 字段');
  const tpl = (await listTemplates())[0];
  assert(tpl.sourceType === 'zhiheng_created', '当前模板 sourceType=zhiheng_created');

  // 13. backward-compatible entry parse（旧 entry 无新字段也能解析）
  console.log('\n13. backward-compatible entry parse');
  const tmpDir2 = path.join(os.tmpdir(), `zhiheng-prod-test2-${Date.now()}`);
  fs.mkdirSync(tmpDir2, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir2, 'registry.json'),
    JSON.stringify({
      version: 1,
      templates: [
        { templateId: 'legacy-1', name: '旧格式模板', status: 'approved', draftPath: 'C:\\test\\old', tags: [], useCases: [] }
      ]
    }),
    'utf8'
  );
  process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT = tmpDir2;
  const legacyReg = await loadTemplateRegistry();
  assert(legacyReg.templates.length === 1, '旧格式 entry 能解析');
  assert(legacyReg.templates[0].enabledForAgent === true, '旧格式 approved 默认 enabledForAgent=true');
  assert(legacyReg.templates[0].productionDraftPath === undefined, '旧格式无 productionDraftPath（兼容）');
  assert(legacyReg.templates[0].frozenFingerprint === undefined, '旧格式无 frozenFingerprint（兼容）');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT;
  fs.unlinkSync(path.join(tmpDir2, 'registry.json'));
  fs.rmdirSync(tmpDir2);

  // 14. promoteResearchTemplate contract
  console.log('\n14. promoteResearchTemplate contract');
  const tmpDir3 = path.join(os.tmpdir(), `zhiheng-prod-test3-${Date.now()}`);
  fs.mkdirSync(tmpDir3, { recursive: true });
  const draftDir = path.join(tmpDir3, 'research-draft');
  fs.mkdirSync(draftDir, { recursive: true });
  process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT = tmpDir3;
  const promoteResult = await promoteResearchTemplate({
    researchTemplateId: 'research-001',
    researchDraftPath: draftDir,
    name: '测试 Promote 模板',
    description: '测试',
    templateType: 'full_video',
    aspectRatio: '9:16',
    promotedBy: 'test'
  });
  assert(promoteResult.ok === true, 'promote 参数校验通过');
  assert(!!promoteResult.templateId, '返回 templateId');
  assert(!!promoteResult.productionDraftPath, '返回 productionDraftPath');
  assert(!!promoteResult.productionDraftPath && promoteResult.productionDraftPath.includes(tmpDir3), 'productionDraftPath 指向 Production 根');
  // 缺少必填参数
  const badPromote = await promoteResearchTemplate({ researchTemplateId: '', researchDraftPath: '', name: '' } as any);
  assert(badPromote.ok === false, '缺少参数时 promote 失败');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT;
  fs.rmdirSync(draftDir);
  fs.rmdirSync(tmpDir3);

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
