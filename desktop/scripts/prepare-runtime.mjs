/**
 * 构建期 Runtime 装配（桌面）：
 *   1) .next/standalone → runtime/next-server（含 node_modules 自包含运行时）
 *   2) static / public / drizzle / skills → next-server 对应目录
 *   3) Worker EXE → runtime/worker/zhiheng-editing-worker.exe
 *   4) PJD fork（去 .git）→ runtime/pjd/pyJianYingDraft + 确定性 SHA256 指纹
 *   5) ResourceMap → runtime/resources/
 *   6) Editing Skill bundled default → runtime/skills/editing/default
 *   7) 生成 desktop-runtime-manifest.json
 *
 * 用法：node scripts/prepare-runtime.mjs <repoRoot>
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const desktopDir = path.join(__dirname, '..');
const runtimeDir = path.join(desktopDir, 'runtime');
const standaloneDir = path.join(repoRoot, '.next', 'standalone');
let nextBuildId = '';
try {
  nextBuildId = fs.readFileSync(path.join(repoRoot, '.next', 'BUILD_ID'), 'utf-8').trim();
} catch { /* ignore */ }

function sha256File(p) {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/** 与 worker pjd_source._desktop_fingerprint 完全一致的确定性目录指纹 */
function sha256Tree(root) {
  const h = createHash('sha256');
  const files = [];
  const walk = (base) => {
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const full = path.join(base, e.name);
      if (e.isDirectory()) walk(full);
      else files.push([path.relative(root, full).split(path.sep).join('/'), full]);
    }
  };
  walk(root);
  for (const [rel, full] of files.sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    h.update(rel);
    h.update(Buffer.from([0]));
    h.update(fs.readFileSync(full));
  }
  return h.digest('hex');
}

function copyDir(src, dest, { ignore = [] } = {}) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  const walk = (s, d) => {
    fs.mkdirSync(d, { recursive: true });
    for (const e of fs.readdirSync(s, { withFileTypes: true })) {
      if (ignore.includes(e.name)) continue;
      const sp = path.join(s, e.name);
      const dp = path.join(d, e.name);
      try {
        const st = fs.lstatSync(sp);
        if (st.isSymbolicLink()) {
          // Next standalone 会把原生模块做成 junction/symlink（指向仓库 node_modules）。
          // 分发必须物化为真实文件，解析目标后拷贝。
          const real = fs.realpathSync(sp);
          const rst = fs.lstatSync(real);
          if (rst.isDirectory()) n += walk(real, dp);
          else {
            fs.copyFileSync(real, dp);
            n += 1;
          }
          continue;
        }
        if (e.isDirectory()) walk(sp, dp);
        else {
          fs.copyFileSync(sp, dp);
          n += 1;
        }
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'EBUSY') {
          // 重试一次（杀软/瞬时占用）
          try {
            const real = fs.realpathSync(sp);
            const rst = fs.lstatSync(real);
            if (rst.isDirectory()) n += walk(real, dp);
            else {
              fs.copyFileSync(real, dp);
              n += 1;
            }
          } catch (err2) {
            throw new Error(`copy failed ${sp}: ${err2.message}`);
          }
        } else {
          throw err;
        }
      }
    }
  };
  walk(src, dest);
  return n;
}

function main() {
  console.log('[prepare-runtime] repoRoot =', repoRoot);
  if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
    throw new Error('.next/standalone 缺失 server.js，请先执行 BUILD_STANDALONE=true npm run build');
  }
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  // 1. Next standalone —— 只拷贝独立运行树必需的条目，
  //    丢弃 standalone 根下混入的仓库内容（.git/src/data/docs/desktop/scripts 等），
  //    保证客户运行时绝不携带开发垃圾。
  const nextServerDir = path.join(runtimeDir, 'next-server');
  console.log('[prepare-runtime] 拷贝 Next standalone（白名单条目）…');
  fs.mkdirSync(nextServerDir, { recursive: true });
  for (const entry of ['server.js', 'package.json', '.next', 'node_modules', 'public']) {
    const src = path.join(standaloneDir, entry);
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isDirectory()) copyDir(src, path.join(nextServerDir, entry));
    else fs.copyFileSync(src, path.join(nextServerDir, entry));
  }
  if (!fs.existsSync(path.join(nextServerDir, 'server.js'))) {
    throw new Error('next-server 装配失败：缺少 server.js');
  }
  if (fs.existsSync(path.join(nextServerDir, '.git')) || fs.existsSync(path.join(nextServerDir, 'src'))) {
    throw new Error('next-server 装配失败：混入了仓库内容（.git/src 存在），请检查 standalone 来源');
  }
  const staticSrc = path.join(repoRoot, '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    copyDir(staticSrc, path.join(nextServerDir, '.next', 'static'));
  }
  const publicSrc = path.join(repoRoot, 'public');
  if (fs.existsSync(publicSrc)) {
    copyDir(publicSrc, path.join(nextServerDir, 'public'));
  }
  const drizzleSrc = path.join(repoRoot, 'drizzle');
  if (fs.existsSync(drizzleSrc)) {
    copyDir(drizzleSrc, path.join(nextServerDir, 'drizzle'));
  }
  const skillsSrc = path.join(repoRoot, 'skills', 'video-editing');
  if (fs.existsSync(skillsSrc)) {
    copyDir(skillsSrc, path.join(nextServerDir, 'skills', 'video-editing'));
  }
  const tplSkillsSrc = path.join(repoRoot, 'skills', 'template-editing');
  if (fs.existsSync(tplSkillsSrc)) {
    copyDir(tplSkillsSrc, path.join(nextServerDir, 'skills', 'template-editing'));
  }

  // 2. Worker EXE
  const workerSrc = path.join(desktopDir, 'runtime-src', 'worker', 'zhiheng-editing-worker.exe');
  const workerDestDir = path.join(runtimeDir, 'worker');
  if (!fs.existsSync(workerSrc)) {
    throw new Error(`Worker EXE 缺失: ${workerSrc}（请先构建 PyInstaller EXE）`);
  }
  fs.mkdirSync(workerDestDir, { recursive: true });
  fs.copyFileSync(workerSrc, path.join(workerDestDir, 'zhiheng-editing-worker.exe'));
  const workerSha = sha256File(path.join(workerDestDir, 'zhiheng-editing-worker.exe'));
  console.log('[prepare-runtime] worker sha256 =', workerSha);

  // 2.5 Template Pipeline CLI EXE + 字幕样式（模板路线客户机执行）
  const tplCliSrc = path.join(desktopDir, 'runtime-src', 'template-pipeline', 'zhiheng-template-cli.exe');
  const tplPipelineDestDir = path.join(runtimeDir, 'template-pipeline');
  if (!fs.existsSync(tplCliSrc)) {
    throw new Error(`模板管线 CLI EXE 缺失: ${tplCliSrc}（请先构建 zhiheng-template-cli.spec）`);
  }
  fs.mkdirSync(tplPipelineDestDir, { recursive: true });
  fs.copyFileSync(tplCliSrc, path.join(tplPipelineDestDir, 'zhiheng-template-cli.exe'));
  const tplCliSha = sha256File(path.join(tplPipelineDestDir, 'zhiheng-template-cli.exe'));
  const subtitleStyleSrc = path.join(repoRoot, 'scripts', 'template-pipeline', 'subtitle-style.default.json');
  if (fs.existsSync(subtitleStyleSrc)) {
    fs.copyFileSync(subtitleStyleSrc, path.join(tplPipelineDestDir, 'subtitle-style.default.json'));
  }
  console.log('[prepare-runtime] template-cli sha256 =', tplCliSha);

  // 3. PJD fork（去 .git）+ 指纹
  const pjdSrc = process.env.ZHIHENG_PJD_SOURCE || 'D:\\剪映智剪测试\\pyJianYingDraft-fork-v0';
  const pjdDest = path.join(runtimeDir, 'pjd', 'pyJianYingDraft');
  if (!fs.existsSync(path.join(pjdSrc, 'pyJianYingDraft'))) {
    throw new Error(`PJD fork 缺失: ${pjdSrc}`);
  }
  copyDir(path.join(pjdSrc, 'pyJianYingDraft'), pjdDest, { ignore: ['.git', '__pycache__'] });
  // 指纹以 ZHIHENG_PJD_ROOT（runtime/pjd，PJD 包所在父目录）为根计算，
  // 与 worker pjd_source._desktop_fingerprint 的根完全一致。
  const pjdSha = sha256Tree(path.join(runtimeDir, 'pjd'));
  console.log('[prepare-runtime] pjd tree sha256 =', pjdSha);

  // 4. ResourceMap
  const resSrc = path.join(repoRoot, 'src', 'engines', 'jianying-adapter', 'resources', 'resource-map.v0.json');
  if (!fs.existsSync(resSrc)) throw new Error(`ResourceMap 缺失: ${resSrc}`);
  fs.mkdirSync(path.join(runtimeDir, 'resources'), { recursive: true });
  fs.copyFileSync(resSrc, path.join(runtimeDir, 'resources', 'resource-map.v0.json'));

  // 5. Editing Skill bundled default
  const skillDefault = path.join(runtimeDir, 'skills', 'editing', 'default');
  copyDir(skillsSrc, skillDefault);
  let skillVersion = '1.0.0';
  try {
    const metas = fs.readdirSync(skillDefault).filter((f) => f.endsWith('.json'));
    const first = JSON.parse(fs.readFileSync(path.join(skillDefault, metas[0]), 'utf-8'));
    skillVersion = first.version || skillVersion;
  } catch { /* keep */ }

  // 6. Golden test assets（可选，冒烟用）
  const goldenSrc = path.join(desktopDir, 'runtime-src', 'assets', 'golden-test');
  if (fs.existsSync(goldenSrc)) {
    copyDir(goldenSrc, path.join(runtimeDir, 'assets', 'golden-test'));
  }

  // 7. 版本与清单
  let electronVersion = 'unknown';
  let electronNode = 'unknown';
  try {
    const ep = path.join(desktopDir, 'node_modules', 'electron', 'package.json');
    if (fs.existsSync(ep)) electronVersion = JSON.parse(fs.readFileSync(ep, 'utf-8')).version;
  } catch { /* ignore */ }
  try {
    const exe = path.join(desktopDir, 'node_modules', 'electron', 'dist', 'electron.exe');
    if (fs.existsSync(exe)) {
      electronNode = execFileSync(exe, ['-e', 'process.stdout.write(process.versions.node)'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf-8'
      }).trim();
    }
  } catch { /* ignore */ }

  const manifest = {
    appVersion: '0.1.0-fieldtest',
    electronVersion,
    nodeVersion: electronNode,
    nextBuildVersion: nextBuildId ? `standalone-${nextBuildId.slice(0, 8)}` : 'standalone',
    workerVersion: 'zhiheng-editing-worker-1.0.0',
    workerSHA256: workerSha,
    templatePipelineVersion: 'zhiheng-template-cli-1.0.0',
    templatePipelineSHA256: tplCliSha,
    pjdCommit: 'fdd9c04fd44257222aa1af45fdd7c4ac029e652e',
    pjdSHA256: pjdSha,
    pjdPackageVersion: 'fork-v0',
    editingSkillVersion: skillVersion,
    databaseRuntime: 'better-sqlite3@13.0.3 (N-API, bundled in next-server node_modules)',
    jianyingVerifiedProfile: '11.4.5.14391',
    ffmpegRequired: 'NO',
    buildTimestamp: new Date().toISOString(),
    runtimeMode: 'desktop-self-contained'
  };
  fs.writeFileSync(path.join(runtimeDir, 'desktop-runtime-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('[prepare-runtime] manifest =', JSON.stringify(manifest, null, 2));
  console.log('[prepare-runtime] 完成。runtime 目录 =', runtimeDir);
}

main();
