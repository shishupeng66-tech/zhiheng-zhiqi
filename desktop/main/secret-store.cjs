'use strict';
/**
 * 安全配置存储：Windows Credential-adjacent 方案 —— Electron safeStorage（DPAPI）
 * 加密后写入 %LOCALAPPDATA%\ZhihengZhiqi\config\secure-config.json。
 *
 * 绝不把 API Key 明文写入 asar / config.json / 安装包。
 * 首次安装通过设置页 / 首次向导写入；内部测试迁移使用显式开关
 * ZHIHENG_ALLOW_DEV_SECRET_IMPORT（读取开发机桥接文件，仅测试期）。
 */
const fs = require('fs');
const path = require('path');
const { configDir } = require('./runtime-paths.cjs');

const CONFIG_FILE = () => path.join(configDir(), 'secure-config.json');
const KEY_MAP = {
  doubaoSpeechApiKey: 'doubaoSpeechApiKey',
  doubaoSpeechResourceId: 'doubaoSpeechResourceId',
  doubaoSpeechWsEndpoint: 'doubaoSpeechWsEndpoint',
  doubaoSpeechDefaultVoice: 'doubaoSpeechDefaultVoice',
  doubaoSpeechUserId: 'doubaoSpeechUserId'
};

let _safeStorage = null;
let _cache = null;

function init(safeStorage) {
  _safeStorage = safeStorage;
  _cache = null;
  fs.mkdirSync(configDir(), { recursive: true });
}

function _isAvailable() {
  return _safeStorage && _safeStorage.isEncryptionAvailable();
}

function _load() {
  if (_cache) return _cache;
  try {
    const raw = fs.readFileSync(CONFIG_FILE(), 'utf-8');
    const parsed = JSON.parse(raw);
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') {
        try {
          out[k] = _isAvailable() ? _safeStorage.decryptString(Buffer.from(v, 'base64')) : v;
        } catch {
          out[k] = '';
        }
      }
    }
    _cache = out;
  } catch {
    _cache = {};
  }
  return _cache;
}

function _save(data) {
  const payload = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string' || !v) continue;
    payload[k] = _isAvailable()
      ? _safeStorage.encryptString(v).toString('base64')
      : Buffer.from(v, 'utf-8').toString('base64');
  }
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(payload, null, 2), 'utf-8');
  _cache = data;
}

/** 读取单个配置（返回明文给 renderer 设置页表单）。 */
function get(key) {
  const data = _load();
  return data[key] ?? '';
}

function getAll() {
  return { ..._load() };
}

/** 写入配置（只接受白名单 key）。 */
function set(key, value) {
  if (!(key in KEY_MAP)) return false;
  const data = _load();
  data[key] = String(value ?? '');
  _save(data);
  return true;
}

/** 删除配置。 */
function remove(key) {
  if (!(key in KEY_MAP)) return false;
  const data = _load();
  delete data[key];
  _save(data);
  return true;
}

/** 内部测试迁移：显式开关下从开发机桥接文件导入（不进入安装包）。 */
function importFromBridge(bridgePath) {
  if (process.env.ZHIHENG_ALLOW_DEV_SECRET_IMPORT !== '1') {
    throw new Error('未开启内部测试迁移开关（ZHIHENG_ALLOW_DEV_SECRET_IMPORT=1）');
  }
  const text = fs.readFileSync(bridgePath, 'utf-8');
  const mapping = {
    DOUBAO_SPEECH_API_KEY: 'doubaoSpeechApiKey',
    DOUBAO_SPEECH_RESOURCE_ID: 'doubaoSpeechResourceId',
    DOUBAO_SPEECH_WS_ENDPOINT: 'doubaoSpeechWsEndpoint',
    DOUBAO_SPEECH_DEFAULT_VOICE: 'doubaoSpeechDefaultVoice',
    DOUBAO_SPEECH_USER_ID: 'doubaoSpeechUserId'
  };
  const data = _load();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const key = mapping[m[1]];
    if (key) data[key] = m[2].replace(/^["']|["']$/g, '');
  }
  _save(data);
  return getAll();
}

module.exports = { init, get, getAll, set, remove, importFromBridge, KEY_MAP };
