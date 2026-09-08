/**
 * Template Repository 测试
 * 用法：npx tsx scripts/test-template-repository.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadTemplateRegistry,
  listTemplates,
  listApprovedTemplates,
  listTestingTemplates,
  listTemplatesByStatus,
  getTemplate,
  searchTemplates
} from '../src/lib/templates';
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
  console.log('=== Template Repository Tests ===\n');

  // 1. root resolve（通过 resolveSystemAsset 解析 jianyingTemplateRoot）
  console.log('1. root resolve');
  const reg = await loadTemplateRegistry();
  assert(reg.rootPath.length > 0, 'rootPath 非空');
  assert(reg.registryPath.includes('registry.json'), 'registryPath 指向 registry.json');
  console.log(`    rootPath: ${reg.rootPath}`);
  console.log(`    registryExists: ${reg.registryExists}`);

  // 2. valid registry（当前已有 1 个 testing 模板）
  console.log('\n2. valid registry');
  const all = await listTemplates();
  assert(all.length >= 1, `模板数量 >= 1（实际 ${all.length}）`);
  if (all.length > 0) {
    const t = all[0];
    assert(!!t.templateId, 'templateId 存在');
    assert(!!t.name, 'name 存在');
    assert(['draft', 'testing', 'approved', 'disabled'].includes(t.status), `status 合法: ${t.status}`);
    assert(!!t.draftPath, 'draftPath 存在');
    assert(!!t.searchText, 'searchText 自动生成');
    assert(t.searchText!.includes(t.name.toLowerCase()), 'searchText 包含 name');
  }

  // 3. approved filter
  console.log('\n3. approved filter');
  const approved = await listApprovedTemplates();
  assert(approved.every((t) => t.status === 'approved'), 'approved 列表只含 approved');
  assert(approved.every((t) => t.enabledForAgent !== false), 'approved 列表 enabledForAgent 不为 false');
  console.log(`    approved count: ${approved.length}`);

  // 4. testing filter
  console.log('\n4. testing filter');
  const testing = await listTestingTemplates();
  assert(testing.every((t) => t.status === 'testing'), 'testing 列表只含 testing');
  console.log(`    testing count: ${testing.length}`);
  assert(testing.length >= 1, '至少 1 个 testing 模板（黄金验证版）');

  // 5. disabled filter
  console.log('\n5. disabled filter');
  const disabled = await listTemplatesByStatus('disabled');
  assert(disabled.every((t) => t.status === 'disabled'), 'disabled 列表只含 disabled');

  // 6. template lookup
  console.log('\n6. template lookup');
  if (all.length > 0) {
    const id = all[0].templateId;
    const found = await getTemplate(id);
    assert(found !== null, `getTemplate(${id}) 找到`);
    assert(found?.templateId === id, 'templateId 匹配');
    const notFound = await getTemplate('nonexistent-id-12345');
    assert(notFound === null, 'getTemplate(不存在) 返回 null');
  }

  // 7. searchText
  console.log('\n7. searchText');
  if (all.length > 0) {
    const kw = all[0].name.slice(0, 2);
    const results = await searchTemplates(kw);
    assert(results.length >= 1, `searchTemplates("${kw}") 有结果`);
    const empty = await searchTemplates('zzz_nonexistent_keyword_xyz');
    assert(empty.length === 0, '搜索不存在关键词返回空');
  }

  // 8. registry missing（临时 ENV 指向不存在的目录）
  console.log('\n8. registry missing');
  const tmpDir = path.join(os.tmpdir(), `zhiheng-tpl-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT = tmpDir;
  const missingReg = await loadTemplateRegistry();
  assert(missingReg.registryExists === false, '不存在 registry 时 registryExists=false');
  assert(missingReg.templates.length === 0, '不存在 registry 时模板为空');
  const missingList = await listTemplates();
  assert(missingList.length === 0, 'listTemplates 在空目录返回空数组（不崩溃）');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT;
  fs.rmdirSync(tmpDir);

  // 9. empty registry（registry.json 存在但 templates 为空）
  console.log('\n9. empty registry');
  const tmpDir2 = path.join(os.tmpdir(), `zhiheng-tpl-test2-${Date.now()}`);
  fs.mkdirSync(tmpDir2, { recursive: true });
  fs.writeFileSync(path.join(tmpDir2, 'registry.json'), JSON.stringify({ version: 1, templates: [] }), 'utf8');
  process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT = tmpDir2;
  const emptyReg = await loadTemplateRegistry();
  assert(emptyReg.registryExists === true, '空 registry 文件存在时 registryExists=true');
  assert(emptyReg.templates.length === 0, '空 registry templates 为空');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT;
  fs.unlinkSync(path.join(tmpDir2, 'registry.json'));
  fs.rmdirSync(tmpDir2);

  // 10. invalid entry（registry 中有无效 entry 被过滤）
  console.log('\n10. invalid entry filter');
  const tmpDir3 = path.join(os.tmpdir(), `zhiheng-tpl-test3-${Date.now()}`);
  fs.mkdirSync(tmpDir3, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir3, 'registry.json'),
    JSON.stringify({
      version: 1,
      templates: [
        { templateId: 'valid-1', name: '有效模板', status: 'approved', draftPath: 'C:\\test\\draft1', templateType: 'full_video', aspectRatio: '9:16', tags: [], useCases: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { name: '无 draftPath' },
        null,
        'not-an-object',
        { templateId: 'valid-2', name: '测试中模板', status: 'testing', draftPath: 'C:\\test\\draft2', templateType: 'title', aspectRatio: '16:9', tags: ['tag1'], useCases: ['场景1'], createdAt: '2026-01-01', updatedAt: '2026-01-01' }
      ]
    }),
    'utf8'
  );
  process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT = tmpDir3;
  const invalidReg = await loadTemplateRegistry();
  assert(invalidReg.templates.length === 2, `无效 entry 被过滤，剩 2 个有效（实际 ${invalidReg.templates.length}）`);
  assert(invalidReg.templates[0].status === 'approved', '第一个有效模板 status=approved');
  assert(invalidReg.templates[0].enabledForAgent === true, 'approved 默认 enabledForAgent=true');
  assert(invalidReg.templates[1].status === 'testing', '第二个有效模板 status=testing');
  assert(invalidReg.templates[1].enabledForAgent === false, 'testing 默认 enabledForAgent=false');
  delete process.env.ZHI_HENG_SYSTEM_ASSET_JIANYINGTEMPLATEROOT;
  fs.unlinkSync(path.join(tmpDir3, 'registry.json'));
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
