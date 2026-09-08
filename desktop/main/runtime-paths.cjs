'use strict';
/**
 * 桌面 Runtime 路径解析（桌面适配层，不改变业务代码语义）。
 *
 * 目录约定：
 *   程序（安装目录）      %LOCALAPPDATA%\Programs\ZhihengZhiqi\
 *     resources\runtime\   自包含 Runtime（Next standalone / Worker EXE / PJD / ResourceMap / Skill / 清单）
 *   应用运行数据          %LOCALAPPDATA%\ZhihengZhiqi\
 *     data\               SQLite + 素材根（STORAGE_ROOT）
 *     config\             安全配置（safeStorage 加密）
 *     logs\               统一日志
 *     Skills\editing\current\   外置可热更新 Skill（可选）
 *     diagnostics\        诊断包输出
 *   客户素材              用户在首次向导中选择（如 D:\客户项目\素材）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

/** 开发模式（desktop/ 目录直接跑 electron .） */
function isDev() {
  return process.env.ZHIHENG_DESKTOP_DEV === '1';
}

/** 程序根目录：dev 下为 desktop/；安装后为 exe 所在安装目录（如 …\Programs\zhiheng-zhiqi-desktop\） */
function programRoot() {
  if (isDev()) return path.join(__dirname, '..');
  // 安装后 electron-builder 布局：<Programs>\<appName>\知衡智企.exe + resources\app.asar
  return path.dirname(process.execPath);
}

function resourcesDir() {
  return path.join(programRoot(), 'resources');
}

/** 自包含 Runtime 根（安装包内） */
function runtimeDir() {
  if (isDev()) return path.join(__dirname, '..', 'runtime');
  return path.join(resourcesDir(), 'runtime');
}

/** 应用运行数据根（%LOCALAPPDATA%\ZhihengZhiqi） */
function appDataDir() {
  return path.join(process.env.LOCALAPPDATA || os.homedir(), 'ZhihengZhiqi');
}

function dataDir() {
  return path.join(appDataDir(), 'data');
}

function configDir() {
  return path.join(appDataDir(), 'config');
}

function logsDir() {
  return path.join(appDataDir(), 'logs');
}

function skillsCurrentDir() {
  return path.join(appDataDir(), 'Skills', 'editing', 'current');
}

function skillsDefaultDir() {
  return path.join(runtimeDir(), 'skills', 'editing', 'default');
}

function diagnosticsDir() {
  return path.join(appDataDir(), 'diagnostics');
}

function workerExePath() {
  return path.join(runtimeDir(), 'worker', 'zhiheng-editing-worker.exe');
}

function pjdDir() {
  return path.join(runtimeDir(), 'pjd');
}

function resourceMapPath() {
  return path.join(runtimeDir(), 'resources', 'resource-map.v0.json');
}

function nextServerDir() {
  return path.join(runtimeDir(), 'next-server');
}

function runtimeManifestPath() {
  return path.join(runtimeDir(), 'desktop-runtime-manifest.json');
}

function goldenAssetsDir() {
  return path.join(runtimeDir(), 'assets', 'golden-test');
}

/** 模板管线 CLI EXE（PyInstaller 自包含） */
function templateCliExePath() {
  return path.join(runtimeDir(), 'template-pipeline', 'zhiheng-template-cli.exe');
}

/** 模板管线 bundled 目录（字幕样式等） */
function templatePipelineDir() {
  return path.join(runtimeDir(), 'template-pipeline');
}

function dbPath() {
  return path.join(dataDir(), 'zhiheng_local.db');
}

function ensureDirs() {
  for (const d of [appDataDir(), dataDir(), configDir(), logsDir(), diagnosticsDir(), path.join(appDataDir(), 'voice-outputs')]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

module.exports = {
  isDev,
  programRoot,
  resourcesDir,
  runtimeDir,
  appDataDir,
  dataDir,
  configDir,
  logsDir,
  skillsCurrentDir,
  skillsDefaultDir,
  diagnosticsDir,
  workerExePath,
  templateCliExePath,
  templatePipelineDir,
  pjdDir,
  resourceMapPath,
  nextServerDir,
  runtimeManifestPath,
  goldenAssetsDir,
  dbPath,
  ensureDirs
};
