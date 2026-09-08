'use strict';
/**
 * 知衡智企 桌面主进程入口。
 *
 * 职责：
 *  1. 单实例锁
 *  2. 目录初始化 + 统一日志
 *  3. safeStorage 安全配置
 *  4. TTS 业务 API 本地桥（Node 直连豆包，替代开发期 Python voice-service）
 *  5. Editing Skill 外置 current / bundled default 决策（junction）
 *  6. 以 Electron 内置 Node 启动 Next 生产服务器（standalone）
 *  7. 主窗口（加载 Next 生产 UI）
 *  8. IPC（getInfo / TTS 配置 / 剪映检测 / 目录选择 / 打开路径）
 */
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const paths = require('./runtime-paths.cjs');
const { logger } = require('./logging.cjs');
const secretStore = require('./secret-store.cjs');
const { createTtsServer } = require('./tts-server.cjs');
const { resolveJianying } = require('./jianying-resolver.cjs');
const { startNextServer, waitForReady } = require('./next-host.cjs');
const { buildNextEnv } = require('./runtime-env.cjs');

const APP_VERSION = '0.1.0-fieldtest';
let nextPort = 0;
let ttsBaseUrl = '';
let mainWindow = null;
let nextChild = null;
let ttsServer = null;
let runtimeManifest = null;

// ---------------------------------------------------------------------------
// 单实例
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Editing Skill 决策：current 存在 → junction 到 current；否则 bundled default
// ---------------------------------------------------------------------------
function ensureSkillLink(nextServerDir) {
  try {
    const target = paths.skillsCurrentDir();
    const fallback = paths.skillsDefaultDir();
    const linkDir = path.join(nextServerDir, 'skills', 'video-editing');

    if (fs.existsSync(target)) {
      fs.rmSync(linkDir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(linkDir), { recursive: true });
      execSyncSafe(`mklink /J "${linkDir}" "${target}"`);
      logger.app(`[skill] 使用外置 current Skill: ${target}`);
      return target;
    }
    if (fs.existsSync(linkDir)) {
      try {
        if (fs.lstatSync(linkDir).isSymbolicLink() || fs.lstatSync(linkDir).isDirectory()) {
          logger.app(`[skill] 保留既有 skills/video-editing`);
          return linkDir;
        }
      } catch {
        /* ignore */
      }
    }
    if (fs.existsSync(fallback)) {
      fs.rmSync(linkDir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(linkDir), { recursive: true });
      execSyncSafe(`mklink /J "${linkDir}" "${fallback}"`);
      logger.app(`[skill] 使用 bundled default Skill: ${fallback}`);
      return fallback;
    }
    logger.warn('[skill] 未找到任何 Editing Skill 目录');
    return null;
  } catch (err) {
    logger.error(`[skill] Skill 目录准备失败: ${err.message}`);
    return null;
  }
}

function execSyncSafe(cmd) {
  const { execSync } = require('child_process');
  try {
    execSync(cmd, { stdio: 'ignore', windowsHide: true });
  } catch (err) {
    logger.warn(`[skill] junction 失败（回退目录拷贝）: ${cmd} -> ${err.message}`);
    // 回退：直接拷贝 bundled default（只读加载，热更新仍可通过 current 目录替换）
    try {
      const from = paths.skillsDefaultDir();
      const to = path.join(paths.nextServerDir(), 'skills', 'video-editing');
      copyDirSafe(from, to);
    } catch (err2) {
      logger.error(`[skill] 目录回退拷贝失败: ${err2.message}`);
    }
  }
}

// 安全递归拷贝（Node fs.cpSync 在 Windows 上对部分目录存在原生崩溃，规避之）
function copyDirSafe(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, e.name);
    const dp = path.join(dest, e.name);
    if (e.isDirectory()) copyDirSafe(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

// ---------------------------------------------------------------------------
// CLI 模式（内部测试迁移；显式开关，不进安装包）
//   zhiheng.exe --import-dev-secrets <桥接文件路径>
//     仅当环境变量 ZHIHENG_ALLOW_DEV_SECRET_IMPORT=1 时生效；
//     把开发机 data/.voice-service-env 中的 TTS 测试凭据导入 safeStorage 配置。
// ---------------------------------------------------------------------------
async function runCliIfRequested() {
  const idx = process.argv.indexOf('--import-dev-secrets');
  if (idx === -1) return false;
  const bridgePath = process.argv[idx + 1];
  if (!bridgePath) {
    console.error('用法: --import-dev-secrets <bridge-file>');
    app.exit(1);
    return true;
  }
  try {
    secretStore.init(safeStorage);
    const result = secretStore.importFromBridge(bridgePath);
    console.log(`[desktop] 内部测试迁移完成：TTS 凭据已导入 safeStorage（${Object.keys(result).filter((k) => result[k]).length} 项）`);
    app.exit(0);
  } catch (err) {
    console.error(`[desktop] 迁移失败: ${err.message}`);
    app.exit(1);
  }
  return true;
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
async function bootstrap() {
  // CLI 模式优先（不启动 GUI）
  if (await runCliIfRequested()) return;

  paths.ensureDirs();
  logger.app(`================================================`);
  logger.app(`知衡智企 桌面版启动 v${APP_VERSION}`);
  logger.app(`electron=${process.versions.electron} node=${process.versions.node} chrome=${process.versions.chrome}`);
  logger.app(`程序根: ${paths.programRoot()}`);
  logger.app(`运行数据: ${paths.appDataDir()}`);

  // 安全配置
  try {
    secretStore.init(safeStorage);
    const ttsConfigured = Boolean(secretStore.get('doubaoSpeechApiKey'));
    logger.app(`[secret] safeStorage 可用，TTS 凭据${ttsConfigured ? '已配置' : '未配置'}`);
  } catch (err) {
    logger.error(`[secret] safeStorage 初始化失败: ${err.message}`);
  }

  // Runtime manifest
  try {
    runtimeManifest = JSON.parse(fs.readFileSync(paths.runtimeManifestPath(), 'utf-8'));
    logger.app(`[manifest] appVersion=${runtimeManifest.appVersion} worker=${runtimeManifest.workerVersion} pjd=${runtimeManifest.pjdCommit} ffmpegRequired=${runtimeManifest.ffmpegRequired}`);
  } catch (err) {
    logger.warn(`[manifest] 未找到 runtime manifest: ${err.message}`);
  }

  // 剪映检测
  const jianying = resolveJianying();
  logger.app(`[jianying] status=${jianying.status} version=${jianying.primaryVersion} note=${jianying.note}`);

  // TTS 本地桥
  try {
    const result = await createTtsServer({
      secretStore,
      outputDir: path.join(paths.appDataDir(), 'voice-outputs'),
      logger
    });
    ttsServer = result.server;
    ttsBaseUrl = result.baseUrl;
    logger.app(`[tts-server] 本地桥就绪 ${ttsBaseUrl}`);
  } catch (err) {
    logger.error(`[tts-server] 启动失败: ${err.message}`);
    ttsBaseUrl = `http://127.0.0.1:0`;
  }

  // 端口
  nextPort = 3200 + Math.floor(Math.random() * 600);

  // Skill junction（必须先于 Next 启动，因为 skill-loader 在进程启动后按 cwd 解析）
  const skillDir = ensureSkillLink(paths.nextServerDir());

  // Next 环境
  const materialRoot = readMaterialRootOverride();
  const nextEnv = buildNextEnv({ nextPort, ttsBaseUrl, materialRoot, jianying, runtimeManifest });
  if (skillDir) nextEnv.ZHIHENG_EDITING_SKILL_DIR = skillDir;

  // 启动 Next
  try {
    nextChild = startNextServer({ nextServerDir: paths.nextServerDir(), port: nextPort, env: nextEnv, logger });
    await waitForReady(`http://127.0.0.1:${nextPort}`, 120000, logger);
    logger.app(`[next] 生产 UI 就绪 http://127.0.0.1:${nextPort}`);
  } catch (err) {
    logger.error(`[next] 启动失败: ${err.message}`);
    dialog.showErrorBox('知衡智企启动失败', `Next 生产服务器启动失败：\n${err.message}\n\n请导出诊断包排查。`);
    app.quit();
    return;
  }

  createWindow();
}

function readMaterialRootOverride() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(paths.configDir(), 'desktop-config.json'), 'utf-8'));
    return cfg.materialRoot || '';
  } catch {
    return '';
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '知衡智企',
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://127.0.0.1:${nextPort}/dashboard/desktop`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('desktop:get-info', () => ({
    appVersion: APP_VERSION,
    versions: { electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome },
    runtimeManifest,
    ttsBaseUrl,
    nextPort,
    dataRoot: paths.appDataDir(),
    programRoot: paths.programRoot(),
    workerExe: paths.workerExePath(),
    pjdDir: paths.pjdDir(),
    skillCurrent: paths.skillsCurrentDir(),
    skillDefault: paths.skillsDefaultDir(),
    jianying: resolveJianying(),
    paths: {
      logs: paths.logsDir(),
      data: paths.dataDir(),
      config: paths.configDir(),
      diagnostics: paths.diagnosticsDir(),
      goldenAssets: paths.goldenAssetsDir()
    }
  }));

  ipcMain.handle('desktop:get-tts-config', () => {
    const all = secretStore.getAll();
    return {
      doubaoSpeechResourceId: all.doubaoSpeechResourceId || '',
      doubaoSpeechWsEndpoint: all.doubaoSpeechWsEndpoint || '',
      doubaoSpeechDefaultVoice: all.doubaoSpeechDefaultVoice || '',
      doubaoSpeechUserId: all.doubaoSpeechUserId || '',
      hasApiKey: Boolean(all.doubaoSpeechApiKey)
    };
  });

  ipcMain.handle('desktop:set-tts-config', (_e, payload) => {
    const p = payload || {};
    for (const key of ['doubaoSpeechApiKey', 'doubaoSpeechResourceId', 'doubaoSpeechWsEndpoint', 'doubaoSpeechDefaultVoice', 'doubaoSpeechUserId']) {
      if (typeof p[key] === 'string') secretStore.set(key, p[key]);
    }
    return { ok: true };
  });

  ipcMain.handle('desktop:detect-jianying', () => resolveJianying());

  ipcMain.handle('desktop:choose-material-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择客户素材根目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true };
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle('desktop:open-path', (_e, p) => {
    if (typeof p === 'string' && p) shell.openPath(p);
    return { ok: true };
  });

  ipcMain.handle('desktop:set-material-root', (_e, materialRoot) => {
    try {
      if (typeof materialRoot !== 'string' || !materialRoot) return { ok: false };
      fs.mkdirSync(paths.configDir(), { recursive: true });
      fs.writeFileSync(
        path.join(paths.configDir(), 'desktop-config.json'),
        JSON.stringify({ materialRoot }, null, 2),
        'utf-8'
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  registerIpc();
  await bootstrap();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  try {
    if (nextChild) nextChild.kill();
  } catch {
    /* noop */
  }
  try {
    if (ttsServer) ttsServer.close();
  } catch {
    /* noop */
  }
});
