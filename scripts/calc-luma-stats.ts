// 计算视频亮度统计：提取 rawvideo Y 通道，计算 avg/min/max/percentile/clip
import { execFileSync } from 'child_process';
import * as fs from 'fs';

const ffmpeg = 'D:\\知衡智企\\bin\\ffmpeg\\ffmpeg.exe';
const outDir = 'D:\\知衡智企\\tmp\\zhiheng-renderer\\hdr-tonemap-comparison';

const versions = [
  'A-current',
  'B-hable-auto-peak',
  'C-hable-desat02',
  'D-mobius',
  'E-reinhard',
  'F-libplacebo-hable',
];

const width = 1080;
const height = 1920;
const frameSize = width * height * 3 / 2; // yuv420p

function calcStats(yValues: number[]): { avg: number; min: number; max: number; p1: number; p50: number; p99: number; clipCount: number } {
  const sorted = [...yValues].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p1 = sorted[Math.floor(sorted.length * 0.01)];
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const clipCount = sorted.filter(v => v > 235).length;
  return { avg, min, max, p1, p50, p99, clipCount };
}

console.log('=== 亮度统计 (Y channel, yuv420p, 全帧采样) ===\n');

for (const v of versions) {
  const file = `${outDir}\\${v}.mp4`;
  if (!fs.existsSync(file)) {
    console.log(`[${v}] 文件不存在`);
    continue;
  }

  // 提取 rawvideo 到临时文件
  const rawFile = `${outDir}\\${v}_raw.yuv`;
  try {
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-i', file,
      '-f', 'rawvideo',
      '-pix_fmt', 'yuv420p',
      '-y', rawFile,
    ], { stdio: 'pipe' });
  } catch (e) {
    console.log(`[${v}] 提取失败: ${e}`);
    continue;
  }

  const buf = fs.readFileSync(rawFile);
  const totalFrames = Math.floor(buf.length / frameSize);
  
  // 采样：每 5 帧取 1 帧，减少计算量
  const allY: number[] = [];
  for (let f = 0; f < totalFrames; f += 5) {
    const offset = f * frameSize;
    for (let i = 0; i < width * height; i++) {
      allY.push(buf[offset + i]);
    }
  }

  const stats = calcStats(allY);
  const clipPct = ((stats.clipCount / allY.length) * 100).toFixed(2);
  
  console.log(`[${v}] (${totalFrames} frames, sampled ${Math.ceil(totalFrames/5)} frames)`);
  console.log(`  Y avg: ${stats.avg.toFixed(1)}  min: ${stats.min}  max: ${stats.max}`);
  console.log(`  P1: ${stats.p1}  P50: ${stats.p50}  P99: ${stats.p99}`);
  console.log(`  Clip (Y>235): ${stats.clipCount} pixels (${clipPct}%)`);
  console.log('');

  // 清理临时文件
  fs.unlinkSync(rawFile);
}
