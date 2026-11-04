import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, basename, resolve } from 'node:path';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { config, logger } from './config.js';
import { Hub } from './hub.js';
import { loadGame } from './gameLoader.js';
import { createHttpHandler } from './http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 框架自带的客户端基类目录（供 /__engine/* 托管）
const engineClientDir = resolve(__dirname, '..', 'client');

function lanAddresses() {
  const out = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out;
}

/** 尽力获取公网 IP（腾讯云 metadata），失败返回 null。 */
async function publicIp() {
  try {
    const res = await fetch('http://metadata.tencentyun.com/latest/meta-data/public-ipv4', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return (await res.text()).trim();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 启动服务端。options 可覆盖 config，并需提供 gameDir（含 game.json 的游戏目录）。
 * 返回句柄 { server, wss, hub, game, port, close }。
 */
export async function startServer(options = {}) {
  const opts = { ...config, ...options };
  if (!opts.gameDir) {
    throw new Error('startServer 需要 gameDir（指向含 game.json 的游戏目录）');
  }

  const game = await loadGame(opts.gameDir);
  if (game.server && game.server.init) await game.server.init();

  const hub = new Hub(game);

  // 游戏客户端静态根目录 = entry 所在目录；入口文件名 = entry 的 basename
  const entryPath = game.manifest.entry.replace(/\\/g, '/');
  const clientRoot = resolve(game.dir, dirname(entryPath));
  const entryFile = basename(entryPath);

  const handler = createHttpHandler({ game, clientRoot, entryFile, engineClientDir, hub });
  const server = http.createServer(handler);

  const wss = new WebSocketServer({ server, path: opts.wsPath });
  wss.on('connection', (ws, req) => {
    logger.debug('ws connected from', req.socket.remoteAddress);
    hub.handleConnection(ws);
  });

  return new Promise((resolveStart) => {
    server.listen(opts.port, opts.host, async () => {
      const port = server.address().port;
      logger.info(`simple-multi-server 已启动: http://${opts.host}:${port}`);
      logger.info(`  - 游戏: ${game.name}${game.server ? '（权威裁决）' : '（纯转发）'}`);
      logger.info(`  - WebSocket 路径: ${opts.wsPath}`);
      logger.info(`  - 本地访问: http://127.0.0.1:${port}/`);
      logger.info(`  - 健康检查: http://127.0.0.1:${port}/health`);
      for (const ip of lanAddresses()) {
        logger.info(`  - 内网访问: http://${ip}:${port}/`);
      }
      const pub = await publicIp();
      if (pub) {
        logger.info(`  - 公网访问: http://${pub}:${port}/  (需在安全组放行 ${port} 端口)`);
      } else {
        logger.warn('  - 未能自动获取公网 IP，请确认安全组/防火墙已放行端口');
      }

      resolveStart({
        server,
        wss,
        hub,
        game,
        port,
        close: () =>
          new Promise((resolveClose) => {
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            server.close(async () => {
              if (game.server && game.server.destroy) {
                try {
                  await game.server.destroy();
                } catch (err) {
                  logger.error('destroy 失败:', err);
                }
              }
              resolveClose();
            });
          }),
      });
    });
  });
}
