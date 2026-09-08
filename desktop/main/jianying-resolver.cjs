'use strict';
/**
 * Jianying Runtime Resolver —— 检测客户已安装剪映（不重新分发剪映内部二进制）。
 *
 * 输出：
 *   installRoot    剪映安装根（含多版本目录的父目录）
 *   versionDirs    [{version, exePath, videoeditorDll, root}]
 *   verified       当前 VERIFIED Profile（11.3.0.14362）
 *   userDataRoot   %LOCALAPPDATA%\JianyingPro\User Data
 *   draftRoot      剪映官方草稿目录
 *   cacheRoot      剪映缓存目录
 *   videoeditorDll 首个可用 videoeditor.dll 绝对路径
 *   status         READY | NOT_FOUND | UNSUPPORTED_VERSION | MISSING_COMPONENT
 *   note           版本差异说明（非 VERIFIED 时明确提示）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERIFIED_VERSIONS = ['11.3.0.14362', '11.4.5.14391'];
const VERIFIED_VERSION = VERIFIED_VERSIONS[VERIFIED_VERSIONS.length - 1];

function resolveJianying() {
  const candidates = [
    process.env.JIANYING_INSTALL_ROOT || '',
    'D:\\JianyingPro',
    'C:\\Program Files\\JianyingPro',
    'C:\\Program Files (x86)\\JianyingPro',
    path.join(process.env.LOCALAPPDATA || '', 'JianyingPro')
  ].filter(Boolean);

  let installRoot = null;
  let versionDirs = [];
  for (const cand of candidates) {
    if (!fs.existsSync(cand)) continue;
    const entries = fs.readdirSync(cand, { withFileTypes: true });
    const hasVersionDirs = entries.some((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name));
    if (hasVersionDirs || entries.some((e) => e.name === 'JianyingPro.exe')) {
      installRoot = cand;
      break;
    }
  }

  if (installRoot) {
    versionDirs = fs
      .readdirSync(installRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name))
      .map((e) => {
        const root = path.join(installRoot, e.name);
        const exePath = path.join(root, 'JianyingPro.exe');
        const videoeditorDll = path.join(root, 'videoeditor.dll');
        return {
          version: e.name,
          root,
          exePath: fs.existsSync(exePath) ? exePath : null,
          videoeditorDll: fs.existsSync(videoeditorDll) ? videoeditorDll : null,
          verified: VERIFIED_VERSIONS.includes(e.name)
        };
      })
      .sort((a, b) => (a.verified ? -1 : 0) - (b.verified ? -1 : 0) || b.version.localeCompare(a.version, undefined, { numeric: true }));
  }

  const userDataRoot = path.join(process.env.LOCALAPPDATA || os.homedir(), 'JianyingPro', 'User Data');
  const draftRoot = path.join(userDataRoot, 'Projects', 'com.lveditor.draft');
  const cacheRoot = path.join(userDataRoot, 'Cache');

  // 首选 VERIFIED 且组件完整的版本；VERIFIED 目录残缺时回退到任一组件完整版本（UNVERIFIED 但可用）；
  // 全部残缺时才保留 VERIFIED 目录并报 MISSING_COMPONENT。
  const primary =
    versionDirs.find((v) => v.verified && v.videoeditorDll) ||
    versionDirs.find((v) => v.videoeditorDll) ||
    versionDirs.find((v) => v.verified) ||
    versionDirs[0] ||
    null;
  let status = 'NOT_FOUND';
  let note = '';
  if (primary) {
    if (primary.verified) {
      status = 'READY';
      note = `VERIFIED 剪映版本 ${primary.version}`;
    } else {
      status = 'UNVERIFIED_VERSION';
      note = `检测到剪映 ${primary.version}（当前 VERIFIED 版本为 ${VERIFIED_VERSIONS.join(' / ')}）。允许继续，但兼容性未经完整验证，不保证草稿表现。`;
    }
    if (!primary.videoeditorDll) {
      status = 'MISSING_COMPONENT';
      note = `剪映 ${primary.version} 缺少 videoeditor.dll`;
    }
  } else if (installRoot) {
    status = 'NOT_FOUND';
    note = `在 ${installRoot} 未找到版本目录`;
  }

  return {
    status,
    installRoot,
    versions: versionDirs.map((v) => ({
      version: v.version,
      verified: v.verified,
      exePath: v.exePath,
      videoeditorDll: v.videoeditorDll
    })),
    primaryVersion: primary ? primary.version : null,
    primaryVerified: primary ? primary.verified : false,
    videoeditorDll: primary ? primary.videoeditorDll : null,
    userDataRoot: fs.existsSync(userDataRoot) ? userDataRoot : null,
    draftRoot: fs.existsSync(draftRoot) ? draftRoot : null,
    cacheRoot: fs.existsSync(cacheRoot) ? cacheRoot : null,
    verifiedProfile: VERIFIED_VERSION,
    note
  };
}

module.exports = { resolveJianying, VERIFIED_VERSION };
