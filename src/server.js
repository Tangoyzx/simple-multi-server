import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, resolve, extname } from 'node:path';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { config, logger } from '../config.js';
import { Hub } from './hub.js';
import { GameRegistry } from './gameRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function contentType(p) {
  return MIME[extname(p).toLowerCase()] || 'application/octet-stream';
}

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
 * 启动服务。options 可覆盖 config（HOST/PORT/TOKEN/LOG_LEVEL）。
 * 返回 Promise，resolve 出一个句柄 { server, wss, hub, registry, port, close }。
 */
export function startServer(options = {}) {
  const opts = { ...config, ...options };
  const registry = new GameRegistry();
  const hub = new Hub(registry);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          uptime: Math.round(process.uptime()),
          now: new Date().toISOString(),
          games: registry.list(),
          rooms: hub.roomCount(),
        })
      );
      return;
    }

    // 静态文件：仅允许 public 目录内，防路径穿越
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const filePath = normalize(join(publicDir, rel));
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden');
      return;
    }

    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'content-type': contentType(filePath) });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });

  const wss = new WebSocketServer({ server, path: opts.wsPath });
  wss.on('connection', (ws, req) => {
    logger.debug('ws connected from', req.socket.remoteAddress);
    hub.handleConnection(ws);
  });

  return new Promise((resolveStart) => {
    server.listen(opts.port, opts.host, async () => {
      const port = server.address().port;
      logger.info(`SimpleMultiServer 已启动: http://${opts.host}:${port}`);
      logger.info(`  - WebSocket 路径: ${opts.wsPath}`);
      logger.info(`  - 本地测试页面: http://127.0.0.1:${port}/`);
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
        registry,
        port,
        close: () =>
          new Promise((resolveClose) => {
            // 强制断开所有连接，避免残留连接卡住 server.close()
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            server.close(() => resolveClose());
          }),
      });
    });
  });
}

// 直接运行时启动（node src/server.js / npm start）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
