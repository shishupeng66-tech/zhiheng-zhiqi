'use strict';
/**
 * 桌面 Runtime 环境装配：为 Next 生产服务器注入全部运行时环境变量。
 * 保证客户机运行的是 bundled runtime，而不是开发目录 / 系统 Node / 开发 PJD fork。
 */
const path = require('path');
const paths = require('./runtime-paths.cjs');

function buildNextEnv({ nextPort, ttsBaseUrl, materialRoot, jianying, runtimeManifest }) {
  const pjdRoot = paths.pjdDir();
  const pjdFingerprint = runtimeManifest && runtimeManifest.pjdSHA256 ? runtimeManifest.pjdSHA256 : '';
  const workerExe = paths.workerExePath();

  return {
    // ---- Next 服务 ----
    PORT: String(nextPort),
    HOSTNAME: '127.0.0.1',

    // ---- 数据与存储（程序与数据分离）----
    DATABASE_PATH: paths.dbPath(),
    STORAGE_ROOT: paths.dataDir(),
    ZHIHENG_RUNTIME_ROOT: paths.runtimeDir(),

    // ---- TTS 业务 API（桌面本地桥，端口由主进程分配）----
    VOICE_SERVICE_URL: ttsBaseUrl,
    VOICE_DEFAULT_ID: 'zh_male_guanggaojieshuo_uranus_bigtts',

    // ---- Python Worker（自包含 EXE）----
    ZHIJING_PYTHON: workerExe,
    ZHIHENG_WORKER_ROOT: path.dirname(workerExe),
    ZHIHENG_WORKER_MODE: 'desktop',

    // ---- 模板管线（自包含 CLI EXE，argv 兼容）----
    ZHIJING_TEMPLATE_CLI: paths.templateCliExePath(),
    ZHIHENG_TEMPLATE_PIPELINE_DIR: paths.templatePipelineDir(),

    // ---- PJD：bundled 目录 + 构建期固化指纹（无 Git / 无 GitHub）----
    ZHIHENG_PJD_ROOT: pjdRoot,
    ZHIHENG_PJD_FINGERPRINT: pjdFingerprint,

    // ---- ResourceMap（PyInstaller 冻结后相对路径失效，指向 bundled 文件）----
    ZHIHENG_RESOURCE_MAP: paths.resourceMapPath(),

    // ---- 剪映 ----
    ZHIHENG_JIANYING_DRAFT_ROOT: process.env.ZHIHENG_JIANYING_DRAFT_ROOT || (jianying && jianying.draftRoot) || '',
    ZHIHENG_DRAFT_ROOT: process.env.ZHIHENG_DRAFT_ROOT || (jianying && jianying.draftRoot) || '',
    ZHIHENG_JIANYING_DIR:
      process.env.ZHIHENG_JIANYING_DIR ||
      (jianying && jianying.installRoot && jianying.primaryVersion
        ? path.join(jianying.installRoot, jianying.primaryVersion)
        : ''),
    ZHIHENG_JIANYING_BACKUP_ROOT: process.env.ZHIHENG_JIANYING_BACKUP_ROOT || '',
    ZHIHENG_JIANYING_OFFICIAL_DRAFT_ROOT: process.env.ZHIHENG_JIANYING_OFFICIAL_DRAFT_ROOT || '',
    ZHIHENG_JIANYING_TIMEOUT_MS: process.env.ZHIHENG_JIANYING_TIMEOUT_MS || '60000',

    // ---- Editing Skill（外置 current 优先，随包 default 兜底）----
    ZHIHENG_EDITING_SKILL_DIR: process.env.ZHIHENG_EDITING_SKILL_DIR || '',

    // ---- 客户素材根（用户在首次向导中选择）----
    ZHIHENG_ASSETS_ROOT: materialRoot || '',

    // ---- 随包黄金测试素材（首次向导可部署到素材根）----
    ZHIHENG_GOLDEN_ASSETS: paths.goldenAssetsDir(),

    // ---- 脱敏输出 ----
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SENTRY_DISABLED: 'true'
  };
}

module.exports = { buildNextEnv };
