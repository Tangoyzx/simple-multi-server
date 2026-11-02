import { games } from './games/index.js';

/**
 * 游戏注册表：name -> 游戏模块。
 * 只做静态映射，不含可变状态；新增游戏只需在 games/index.js 里登记。
 */
export class GameRegistry {
  constructor() {
    this.registry = new Map();
    for (const mod of Object.values(games)) {
      if (!mod || !mod.name) continue;
      this.registry.set(mod.name, mod);
    }
  }

  has(name) {
    return this.registry.has(name);
  }

  get(name) {
    return this.registry.get(name) || null;
  }

  /**
   * 解析游戏名：未知的游戏名回退到 relay（纯转发），
   * 这样客户端可以不经服务端改动就开新的转发房间。
   */
  resolve(name) {
    return this.registry.get(name) || this.registry.get('relay');
  }

  list() {
    return [...this.registry.values()].map((m) => ({
      name: m.name,
      relay: !!m.relay,
      maxPlayers: m.maxPlayers ?? null,
    }));
  }
}
