/**
 * 素材搜索功能测试脚本（直接加载索引文件，不依赖 StorageService/数据库）
 *
 * 用法：npx tsx scripts/test-asset-search.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { searchVideoClips, type VideoClipResult, type VideoAsset, type TimelineSegment, type RecommendedCut } from '../src/lib/agent/video-asset-index';

const INDEX_PATH = 'D:\\知衡智企数据库\\素材资源\\video-assets-detailed.json';

// 直接加载索引并手动注入缓存的替代方案：
// 我们复制一份 searchVideoClips 的核心逻辑，直接用加载的 assets 数组测试
// 这样不依赖 StorageService 和数据库

function loadAssetsDirectly(): VideoAsset[] {
  const content = fs.readFileSync(INDEX_PATH, 'utf-8');
  const data = JSON.parse(content);
  return data.assets as VideoAsset[];
}

// 复制搜索逻辑（简化版，用于测试）
function testSearch(
  assets: VideoAsset[],
  params: {
    query?: string;
    contentType?: string;
    usageRoles?: string[];
    topicTags?: string[];
    orientation?: 'landscape' | 'portrait';
    preferredOnly?: boolean;
    excludeDuplicateGroups?: boolean;
    minClipDuration?: number;
    maxClipDuration?: number;
    limit?: number;
  }
): VideoClipResult[] {
  // 展开所有 segment
  const allClips: Array<{
    asset: VideoAsset;
    segment: TimelineSegment;
    recommendedCut?: RecommendedCut;
  }> = [];

  for (const asset of assets) {
    for (const segment of asset.timelineSegments) {
      if (!segment.usable) continue;
      const bestCut = findBestRecommendedCut(segment, asset.recommendedCuts);
      allClips.push({ asset, segment, recommendedCut: bestCut });
    }
  }

  // 过滤
  let filtered = allClips.filter(({ asset, segment }) => {
    if (params.orientation) {
      if (asset.orientation !== params.orientation) {
        if (params.orientation === 'portrait' && asset.orientation === 'landscape') {
          if (segment.cropSafety !== 'good' && segment.verticalCropSuitability !== 'good') {
            return false;
          }
        }
      }
    }
    if (params.preferredOnly && !asset.preferred) return false;
    if (params.usageRoles && params.usageRoles.length > 0) {
      const hasMatch = params.usageRoles.some((role) =>
        segment.usageRoles.some((r) => r.includes(role) || role.includes(r))
      );
      if (!hasMatch) return false;
    }
    if (params.topicTags && params.topicTags.length > 0) {
      const hasMatch = params.topicTags.some((tag) =>
        segment.topicTags.some((t) => t.includes(tag) || t.includes(tag))
      );
      if (!hasMatch) return false;
    }
    const duration = segment.end - segment.start;
    if (params.minClipDuration && duration < params.minClipDuration) return false;
    if (params.maxClipDuration && duration > params.maxClipDuration) return false;
    if (isInAvoidCuts(segment, asset.avoidCuts)) return false;
    return true;
  });

  // 评分
  let scored = filtered.map(({ asset, segment, recommendedCut }) => {
    const { score, reasons } = calculateScore(asset, segment, params);
    return { asset, segment, recommendedCut, score, reasons };
  });

  // 排序
  scored.sort((a, b) => b.score - a.score);

  // 去重
  if (params.excludeDuplicateGroups !== false) {
    const seenGroups = new Set<string>();
    scored = scored.filter(({ asset }) => {
      if (!asset.duplicateGroup) return true;
      if (seenGroups.has(asset.duplicateGroup)) return false;
      seenGroups.add(asset.duplicateGroup);
      return true;
    });
  }

  // limit
  const limit = params.limit ?? 10;
  const top = scored.slice(0, limit);

  // 转换输出
  return top.map(({ asset, segment, recommendedCut, score, reasons }) => {
    let recStart = segment.start;
    let recEnd = segment.end;
    if (recommendedCut) {
      recStart = Math.max(segment.start, recommendedCut.start);
      recEnd = Math.min(segment.end, recommendedCut.end);
    }
    const maxLen = segment.recommendedClipLength?.max ?? segment.end - segment.start;
    const minLen = segment.recommendedClipLength?.min ?? 0;
    const currentLen = recEnd - recStart;
    if (currentLen > maxLen) recEnd = recStart + maxLen;
    if (currentLen < minLen) recEnd = Math.min(segment.end, recStart + minLen);

    return {
      assetId: asset.id,
      fileName: asset.fileName,
      relativePath: asset.relativePath,
      category: asset.normalizedCategory,
      segmentStart: segment.start,
      segmentEnd: segment.end,
      recommendedStart: Math.round(recStart * 10) / 10,
      recommendedEnd: Math.round(recEnd * 10) / 10,
      clipDuration: Math.round((recEnd - recStart) * 10) / 10,
      content: segment.content,
      action: segment.action,
      shotType: segment.shotType,
      cameraAngle: segment.cameraAngle,
      cameraMovement: segment.cameraMovement,
      topicTags: segment.topicTags,
      semanticMatches: segment.semanticMatches,
      usageRoles: segment.usageRoles,
      recommendedSkills: segment.recommendedSkills,
      visualQuality: segment.visualQuality,
      cropSafety: segment.cropSafety,
      orientation: asset.orientation as 'landscape' | 'portrait' | 'square',
      duplicateGroup: asset.duplicateGroup,
      preferred: asset.preferred,
      matchScore: Math.round(score * 1000) / 1000,
      matchReasons: reasons
    };
  });
}

function findBestRecommendedCut(segment: TimelineSegment, cuts: RecommendedCut[]): RecommendedCut | undefined {
  if (!cuts || cuts.length === 0) return undefined;
  let best: RecommendedCut | undefined;
  let bestOverlap = 0;
  for (const cut of cuts) {
    const overlapStart = Math.max(segment.start, cut.start);
    const overlapEnd = Math.min(segment.end, cut.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = cut;
    }
  }
  return best;
}

function isInAvoidCuts(segment: TimelineSegment, avoidCuts: any[]): boolean {
  if (!avoidCuts || avoidCuts.length === 0) return false;
  const segDuration = segment.end - segment.start;
  for (const avoid of avoidCuts) {
    const overlapStart = Math.max(segment.start, avoid.start);
    const overlapEnd = Math.min(segment.end, avoid.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    if (overlap > segDuration * 0.5) return true;
  }
  return false;
}

function calculateScore(
  asset: VideoAsset,
  segment: TimelineSegment,
  params: any
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const w = {
    semanticMatch: 0.3, contentMatch: 0.2, topicMatch: 0.15,
    usageRoleMatch: 0.15, skillMatch: 0.05, quality: 0.05,
    preferred: 0.05, orientation: 0.05
  };

  if (params.query) {
    const q = params.query.toLowerCase();
    const semHits = segment.semanticMatches.filter((s: string) =>
      s.toLowerCase().includes(q) || q.includes(s.toLowerCase())
    );
    if (semHits.length > 0) {
      score += w.semanticMatch * Math.min(1, semHits.length * 0.4);
      reasons.push(`语义匹配：${semHits.slice(0, 2).join('、')}`);
    }
    if (segment.content.toLowerCase().includes(q)) {
      score += w.contentMatch * 1.0;
      reasons.push('内容描述匹配');
    } else {
      const keywords = q.split(/[\s，,。.！!？?]+/).filter((k: string) => k.length >= 2);
      let hits = 0;
      for (const kw of keywords) {
        if (segment.content.toLowerCase().includes(kw)) hits++;
      }
      if (hits > 0) {
        score += w.contentMatch * Math.min(1, hits / keywords.length) * 0.5;
        reasons.push(`内容部分匹配（${hits}/${keywords.length} 关键词）`);
      }
    }
    const topicHits = segment.topicTags.filter((t: string) =>
      t.toLowerCase().includes(q) || q.includes(t.toLowerCase())
    );
    if (topicHits.length > 0) {
      score += w.topicMatch * Math.min(1, topicHits.length * 0.3);
      reasons.push(`主题标签匹配：${topicHits.slice(0, 2).join('、')}`);
    }
  } else {
    score += (w.semanticMatch + w.contentMatch + w.topicMatch) * 0.3;
  }

  if (params.usageRoles && params.usageRoles.length > 0) {
    const roleHits = params.usageRoles.filter((role: string) =>
      segment.usageRoles.some((r: string) =>
        r.toLowerCase().includes(role.toLowerCase()) || role.toLowerCase().includes(r.toLowerCase())
      )
    );
    if (roleHits.length > 0) {
      score += w.usageRoleMatch * Math.min(1, roleHits.length / params.usageRoles.length);
      reasons.push(`用途匹配：${roleHits.join('、')}`);
    }
  } else {
    score += w.usageRoleMatch * 0.3;
  }

  if (params.contentType) {
    const skillHits = segment.recommendedSkills.filter((s: string) =>
      s.includes(params.contentType) || params.contentType.includes(s)
    );
    if (skillHits.length > 0) {
      score += w.skillMatch * 1.0;
      reasons.push(`适合${params.contentType}风格`);
    }
  } else {
    score += w.skillMatch * 0.5;
  }

  if (segment.visualQuality === 'good') { score += w.quality * 1.0; reasons.push('画质良好'); }
  else if (segment.visualQuality === 'medium') { score += w.quality * 0.6; }
  else { score += w.quality * 0.3; }

  if (asset.preferred) { score += w.preferred * 1.0; reasons.push('优选素材'); }
  else { score += w.preferred * 0.3; }

  if (params.orientation) {
    if (asset.orientation === params.orientation) {
      score += w.orientation * 1.0;
      reasons.push(params.orientation === 'portrait' ? '竖屏素材' : '横屏素材');
    } else if (segment.cropSafety === 'good') {
      score += w.orientation * 0.5;
      reasons.push('可裁剪适配');
    } else {
      score += w.orientation * 0.2;
    }
  } else {
    score += w.orientation * 0.5;
  }

  score = Math.max(0, Math.min(1, score));
  return { score, reasons };
}

async function main() {
  console.log('========================================');
  console.log('  素材搜索功能测试');
  console.log('========================================\n');

  if (!fs.existsSync(INDEX_PATH)) {
    console.log(`❌ 索引文件不存在: ${INDEX_PATH}`);
    return;
  }

  const assets = loadAssetsDirectly();
  console.log(`📊 索引统计:`);
  console.log(`   素材总数: ${assets.length}`);

  let totalSegments = 0, totalCuts = 0, totalAvoid = 0;
  const dupGroups = new Set<string>();
  let preferredCount = 0, portraitCount = 0, landscapeCount = 0;

  for (const a of assets) {
    totalSegments += a.timelineSegments?.length ?? 0;
    totalCuts += a.recommendedCuts?.length ?? 0;
    totalAvoid += a.avoidCuts?.length ?? 0;
    if (a.duplicateGroup) dupGroups.add(a.duplicateGroup);
    if (a.preferred) preferredCount++;
    if (a.orientation === 'portrait') portraitCount++;
    if (a.orientation === 'landscape') landscapeCount++;
  }

  console.log(`   片段总数 (timelineSegments): ${totalSegments}`);
  console.log(`   推荐剪辑点 (recommendedCuts): ${totalCuts}`);
  console.log(`   避免剪辑点 (avoidCuts): ${totalAvoid}`);
  console.log(`   重复素材组 (duplicateGroup): ${dupGroups.size} 组`);
  console.log(`   优选素材 (preferred=true): ${preferredCount}`);
  console.log(`   竖屏素材: ${portraitCount}`);
  console.log(`   横屏素材: ${landscapeCount}`);
  console.log();

  const testCases = [
    {
      name: '测试 A：无菌灌装素材',
      description: '用户："帮我找适合讲无菌灌装的素材"',
      params: { query: '无菌灌装', limit: 8 }
    },
    {
      name: '测试 B：老板IP + 工厂混合',
      description: '用户："找5个适合做老板IP视频的镜头，最好有人物，也穿插工厂生产"',
      params: { query: '老板IP 工厂 生产', limit: 8 }
    },
    {
      name: '测试 C：品控主题素材',
      description: '用户："我想讲客户为什么应该重视品控，有哪些画面可以配？"',
      params: { query: '品控 质量 检验 研发', limit: 8 }
    },
    {
      name: '测试 D：音画一致性 - 原材料验收',
      description: '脚本："原材料进入工厂以后，第一步不是直接生产，而是先经过验收和检查。"',
      params: { query: '原材料验收 检查 进厂', limit: 10 }
    }
  ];

  for (const tc of testCases) {
    console.log(`\n── ${tc.name} ──`);
    console.log(`  ${tc.description}`);
    console.log(`  搜索参数: ${JSON.stringify(tc.params)}\n`);

    const results = testSearch(assets, tc.params);

    console.log(`  找到 ${results.length} 个片段:\n`);

    results.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.matchScore.toFixed(3)}] ${r.fileName}`);
      console.log(`     推荐: ${r.recommendedStart}s → ${r.recommendedEnd}s (${r.clipDuration}s)`);
      console.log(`     内容: ${r.content}`);
      console.log(`     用途: ${r.usageRoles.join(', ')}`);
      console.log(`     画质: ${r.visualQuality} | 裁剪: ${r.cropSafety} | ${r.orientation}`);
      if (r.duplicateGroup) console.log(`     重复组: ${r.duplicateGroup}`);
      if (r.preferred) console.log(`     ⭐ 优选素材`);
      console.log(`     匹配理由: ${r.matchReasons.slice(0, 3).join('; ')}`);
      console.log();
    });

    if (results.length === 0) {
      console.log('  ⚠️  未找到匹配的片段');
    }
  }

  // 额外验证：avoidCuts 排除
  console.log('\n── 额外验证：avoidCuts 排除机制 ──');
  const assetsWithAvoid = assets.filter((a) => a.avoidCuts && a.avoidCuts.length > 0);
  console.log(`  有 avoidCuts 的素材: ${assetsWithAvoid.length} 个`);
  for (const a of assetsWithAvoid.slice(0, 3)) {
    console.log(`  - ${a.fileName}: ${a.avoidCuts.length} 个避免区域`);
    for (const ac of a.avoidCuts) {
      console.log(`    · ${ac.start}s-${ac.end}s: ${ac.reason}`);
    }
  }

  // 额外验证：duplicateGroup 去重
  console.log('\n── 额外验证：duplicateGroup 去重 ──');
  const r1 = testSearch(assets, { query: '口播', limit: 20, excludeDuplicateGroups: false });
  const r2 = testSearch(assets, { query: '口播', limit: 20, excludeDuplicateGroups: true });
  const g1 = new Set(r1.filter((r) => r.duplicateGroup).map((r) => r.duplicateGroup!));
  const g2 = new Set(r2.filter((r) => r.duplicateGroup).map((r) => r.duplicateGroup!));
  console.log(`  不去重: ${r1.length} 个结果, ${g1.size} 个重复组`);
  console.log(`  去重后: ${r2.length} 个结果, ${g2.size} 个重复组`);
  console.log(`  每组最多 1 个: ${[...g2].every((g) => r2.filter((r) => r.duplicateGroup === g).length <= 1)}`);

  console.log('\n========================================');
  console.log('  测试完成');
  console.log('========================================');
}

main().catch(console.error);
