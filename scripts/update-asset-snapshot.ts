/**
 * 更新 System Asset Registry Snapshot（诊断快照，非配置源）
 */
import { buildSystemAssetSnapshot } from '@/lib/system-assets';
import fs from 'node:fs';

async function main() {
  const snap = await buildSystemAssetSnapshot();
  const out = 'D:\\知衡智企数据库\\系统资产\\system-asset-registry.snapshot.json';
  fs.mkdirSync('D:\\知衡智企数据库\\系统资产', { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snap, null, 2), 'utf-8');
  console.log('Snapshot 已写入:', out);
  for (const [k, v] of Object.entries(snap.assets)) {
    console.log(`  ${k}: ${v.path} (${v.source})`);
  }
}
main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
