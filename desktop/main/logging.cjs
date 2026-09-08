'use strict';
/**
 * 统一日志（桌面层）：%LOCALAPPDATA%\ZhihengZhiqi\logs\
 *   app.log / agent.log / editing.log / worker.log / runtime.log
 * 全部写入做脱敏（API Key / Authorization / token / secret / password）。
 */
const fs = require('fs');
const path = require('path');
const { logsDir, ensureDirs } = require('./runtime-paths.cjs');

const SECRET_PATTERNS = [
  /(api[_-]?key|authorization|bearer\s+|token|secret|password|passwd|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;}{]+/gi,
  /(X-Api-Key|Authorization)\s*[:=]\s*[^\s,;}]+/gi
];

function redact(line) {
  let out = String(line);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, p1) => {
      const key = p1 || m.split(/[:=]/)[0] || 'secret';
      return `${key}=***REDACTED***`;
    });
  }
  return out;
}

const writers = new Map();

function getWriter(name) {
  ensureDirs();
  if (!writers.has(name)) {
    const file = path.join(logsDir(), `${name}.log`);
    const stream = fs.createWriteStream(file, { flags: 'a', encoding: 'utf-8' });
    writers.set(name, stream);
  }
  return writers.get(name);
}

function write(name, level, message) {
  try {
    const ts = new Date().toISOString();
    getWriter(name).write(`[${ts}] [${level}] ${redact(message)}\n`);
  } catch {
    /* 日志失败不阻断主流程 */
  }
}

const logger = {
  app: (msg) => write('app', 'INFO', msg),
  agent: (msg) => write('agent', 'INFO', msg),
  editing: (msg) => write('editing', 'INFO', msg),
  worker: (msg) => write('worker', 'INFO', msg),
  runtime: (msg) => write('runtime', 'INFO', msg),
  error: (msg) => write('app', 'ERROR', msg),
  warn: (msg) => write('app', 'WARN', msg),
  redact
};

module.exports = { logger, redact };
