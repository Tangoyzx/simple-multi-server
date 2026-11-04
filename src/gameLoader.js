import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 加载单个游戏：
 *  - 读 game.json（校验 name/entry）
 *  - 若有 server 字段，动态 import 其 default 类并实例化
 *  - 无 server → server 为 null（纯转发）
 */
export async function loadGame(gameDir) {
  const dir = resolve(gameDir);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8'));
  } catch (err) {
    throw new Error(`无法读取 ${join(dir, 'game.json')}: ${err.message}`);
  }

  if (!manifest || typeof manifest.name !== 'string' || !manifest.name) {
    throw new Error('game.json 必须包含字符串字段 name');
  }
  if (typeof manifest.entry !== 'string' || !manifest.entry) {
    throw new Error('game.json 必须包含 entry（如 client/index.html）');
  }

  let server = null;
  if (manifest.server) {
    const url = pathToFileURL(join(dir, manifest.server)).href;
    let mod;
    try {
      mod = await import(url);
    } catch (err) {
      throw new Error(`无法加载 ${manifest.server}: ${err.message}`);
    }
    const Cls = mod.default;
    if (typeof Cls !== 'function') {
      throw new Error(`${manifest.server} 必须 default 导出一个继承 GameServer 的类`);
    }
    server = new Cls({ name: manifest.name, dir, manifest });
  }

  return {
    name: manifest.name,
    title: manifest.title || manifest.name,
    dir,
    manifest,
    server,
  };
}
