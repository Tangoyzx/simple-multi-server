import { randomUUID } from 'node:crypto';

/**
 * 代表一条已建立的 WebSocket 连接 / 一名客户端。
 * 服务端为每个连接分配唯一 id；name 由客户端在 join 时可选提供。
 */
export class Player {
  constructor(ws) {
    this.id = randomUUID();
    this.ws = ws;
    this.name = null;
    this.game = null; // 已加入的游戏名
    this.room = null; // 已加入的房间 id
    this.attached = false; // 是否已成功 join 到房间
  }

  /** WebSocket.OPEN === 1，只在连接仍打开时发送。 */
  isOpen() {
    return this.ws.readyState === 1;
  }

  send(obj) {
    if (this.isOpen()) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch (err) {
        // 发送失败不影响其他玩家；连接会在 close 事件里被清理
      }
    }
  }

  /** 对外暴露的公开信息（不含 ws 引用）。 */
  toPublic() {
    return { id: this.id, name: this.name };
  }
}
