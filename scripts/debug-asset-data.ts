import { loadVideoAssetIndex } from '../src/lib/agent/video-asset-index';

async function main() {
  const assets = await loadVideoAssetIndex();
  console.log(`Total assets: ${assets.length}`);

  // 找无菌_1
  const wujun1 = assets.find((a) => a.fileName.includes('无菌') && a.fileName.includes('1'));
  if (wujun1) {
    console.log('\n=== 无菌_1.MP4 ===');
    console.log('segments:');
    wujun1.timelineSegments.forEach((s, i) => {
      console.log(`  [${i}] ${s.start}-${s.end}s usable=${s.usable} quality=${s.visualQuality} content=${s.content}`);
      console.log(`      topicTags: ${s.topicTags.join(',')}`);
      console.log(`      semanticMatches: ${s.semanticMatches.join(',')}`);
      console.log(`      usageRoles: ${s.usageRoles.join(',')}`);
      console.log(`      recommendedClipLength: ${s.recommendedClipLength?.min}-${s.recommendedClipLength?.max}`);
    });
    console.log('recommendedCuts:');
    wujun1.recommendedCuts.forEach((c, i) => {
      console.log(`  [${i}] ${c.start}-${c.end}s priority=${c.priority} reason=${c.reason} bestFor=${c.bestFor.join(',')}`);
    });
    console.log('avoidCuts:');
    wujun1.avoidCuts.forEach((c, i) => {
      console.log(`  [${i}] ${c.start}-${c.end}s reason=${c.reason}`);
    });
  }

  // 找客户接待_1
  const khjd1 = assets.find((a) => a.fileName.includes('客户接待') && a.fileName.includes('1'));
  if (khjd1) {
    console.log('\n=== 客户接待_1.mp4 ===');
    console.log('segments:');
    khjd1.timelineSegments.forEach((s, i) => {
      console.log(`  [${i}] ${s.start}-${s.end}s usable=${s.usable} quality=${s.visualQuality} content=${s.content}`);
    });
    console.log('recommendedCuts:');
    khjd1.recommendedCuts.forEach((c, i) => {
      console.log(`  [${i}] ${c.start}-${c.end}s priority=${c.priority} reason=${c.reason}`);
    });
    console.log('avoidCuts:');
    khjd1.avoidCuts.forEach((c, i) => {
      console.log(`  [${i}] ${c.start}-${c.end}s reason=${c.reason}`);
    });
  }
}

main().catch(console.error);
