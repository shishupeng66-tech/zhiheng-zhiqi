import fs from 'node:fs';

const data = JSON.parse(
  fs.readFileSync(
    'D:/知衡智企数据库/知识文件/视频内容策略/05-测试基准/video-search-benchmark-v1.json',
    'utf-8'
  )
);

const cases = data.cases || data;
const arr = Array.isArray(cases) ? cases : Object.values(cases);

console.log(`Total cases: ${arr.length}`);
console.log('---');

arr.slice(0, 8).forEach((c: any, i: number) => {
  console.log(`Case ${i + 1}: ${c.id}`);
  console.log(`  query: ${c.query}`);
  console.log(`  usageRoles: ${(c.usageRoles || []).join(',')}`);
  console.log(`  contentType: ${c.contentType || ''}`);
  console.log(`  expectedTopIds: ${JSON.stringify(c.expectedTopIds || c.expected)}`);
  console.log(`  insufficient: ${c.insufficientMaterial || false}`);
  console.log('');
});
