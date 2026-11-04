import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { PROTOCOL_VERSION } from './config.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const NO_STORE = 'no-store';

function contentType(p) {
  return MIME[extname(p).toLowerCase()] || 'application/octet-stream';
}

async function serveFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': contentType(filePath),
      'cache-control': NO_STORE,
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': NO_STORE });
    res.end('not found');
  }
}

function forbidden(res) {
  res.writeHead(403, { 'content-type': 'text/plain', 'cache-control': NO_STORE });
  res.end('forbidden');
}

/**
 * 构建 HTTP 请求处理器。
 * @param {object} p
 * @param {{ name:string, title:string, dir:string, manifest:object, server:object|null }} p.game
 * @param {string} p.clientRoot  游戏客户端静态根目录
 * @param {string} p.entryFile   客户端入口文件名（相对 clientRoot）
 * @param {string} p.engineClientDir 框架客户端基类目录
 * @param {object} p.hub
 */
export function createHttpHandler({ game, clientRoot, entryFile, engineClientDir, hub }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': NO_STORE });
      res.end(
        JSON.stringify({
          ok: true,
          game: game.name,
          protocolVersion: PROTOCOL_VERSION,
          rooms: hub.roomCount(),
          now: new Date().toISOString(),
        })
      );
      return;
    }

    // 框架客户端基类（保留前缀，避免与游戏资源冲突）
    if (pathname.startsWith('/__engine/')) {
      const rel = pathname.slice('/__engine/'.length);
      const fp = normalize(join(engineClientDir, rel));
      if (!fp.startsWith(engineClientDir)) return forbidden(res);
      return serveFile(res, fp);
    }

    // 游戏客户端静态文件
    const rel = pathname === '/' ? entryFile : pathname.replace(/^\/+/, '');
    const fp = normalize(join(clientRoot, rel));
    if (!fp.startsWith(clientRoot)) return forbidden(res);
    return serveFile(res, fp);
  };
}
