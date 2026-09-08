/**
 * 生成 System Asset Registry 诊断快照。
 * 用法：npx tsx scripts/gen-system-asset-snapshot.ts
 * 输出：D:\知衡智企数据库\知识库\90_模板\system-asset-registry.snapshot.json
 *      （2026-09-07 起 系统资产 目录已并入知识库）
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildSystemAssetSnapshot, inspectSystemAssets } from '../src/lib/system-assets';

async function main() {
  const snapshot = await buildSystemAssetSnapshot();
  const outDir = 'D:\\知衡智企数据库\\知识库\\90_模板';
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'system-asset-registry.snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('Snapshot written to:', outPath);
  const assets = await inspectSystemAssets();
  for (const a of assets) {
    console.log(`  ${a.key}: ${a.exists ? 'EXISTS' : 'MISSING'} (${a.source}) ${a.path}`);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
