'use strict';
/**
 * Next 生产服务器宿主：以 Electron 内置 Node 启动 .next/standalone/server.js。
 * （客户机不安装 Node；Electron 自带 Runtime。ELECTRON_RUN_AS_NODE=1 时
 *   Electron 二进制即作为纯 Node 运行。）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

function waitForReady(baseUrl, timeoutMs, logger) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(`${baseUrl}/api/desktop/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve(true);
          retry();
        })
        .on('error', retry);
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('Next 生产服务器启动超时'));
      setTimeout(tick, 800);
    };
    tick();
  });
}

/**
 * 启动 Next standalone 服务器。
 * @param {object} opts { nextServerDir, port, env }
 */
function startNextServer({ nextServerDir, port, env, logger }) {
  const serverJs = path.join(nextServerDir, 'server.js');
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Next standalone 缺失 server.js: ${serverJs}`);
  }
  // standalone 内 node_modules 需随包（.next/standalone 已含运行时 node_modules）
  const child = spawn(process.execPath, [serverJs], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      ...env
    },
    cwd: nextServerDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (d) => {
    const line = String(d).trim();
    if (line) logger.runtime(line);
  });
  child.stderr.on('data', (d) => {
    const line = String(d).trim();
    if (line) logger.runtime(`[stderr] ${line}`);
  });
  child.on('exit', (code, signal) => {
    logger.app(`[next-host] Next 服务器退出 code=${code} signal=${signal}`);
  });

  return child;
}

module.exports = { startNextServer, waitForReady };
