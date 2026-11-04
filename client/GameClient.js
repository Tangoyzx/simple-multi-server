/**
 * GameClient —— simple-multi-server 客户端基类（浏览器原生 ESM）。
 *
 * 由框架在 /__engine/GameClient.js 统一托管，游戏客户端 HTML 用
 * <script src="/__engine/GameClient.js"></script> 引用，或复制到项目里使用。
 *
 * 事件：open / joined / message / error / closed / peer_join / peer_leave / wsError / *
 *
 * 用法：
 *   const c = new GameClient(`ws://${location.host}/ws`);
 *   c.on('joined', m => console.log('my id =', m.you));
 *   c.on('message', m => console.log('recv', m));
 *   await c.connect();
 *   c.join({ game: 'tictactoe', room: 'room-1', name: 'alice' });
 *   c.send({ type: 'move', index: 0 });
 */
export class GameClient {
  /**
   * @param {string} url WebSocket 地址
   * @param {{ WebSocketImpl?: typeof WebSocket }} [opts]
   */
  constructor(url, opts = {}) {
    this.url = url;
    this.WebSocketImpl = opts.WebSocketImpl || globalThis.WebSocket;
    this.ws = null;
    this.id = null; // joined 后由服务端分配的 you
    this.game = null;
    this.room = null;
    this.listeners = new Map(); // event -> Set<fn>
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return this;
  }

  off(event, fn) {
    const set = this.listeners.get(event);
    if (set) set.delete(fn);
    return this;
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(data);
      } catch (err) {
        console.error('[GameClient] listener error', err);
      }
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new this.WebSocketImpl(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.emit('open');
        resolve(this);
      };
      ws.onmessage = (ev) => this._onMessage(ev.data);
      ws.onclose = (ev) => this.emit('close', ev);
      ws.onerror = (ev) => {
        this.emit('wsError', ev); // 连接层错误，区别于服务端 op:'error' 消息
        reject(ev);
      };
    });
  }

  join({ game, room = 'default', name, token } = {}) {
    const msg = { op: 'join', game: game || 'relay', room };
    if (name != null) msg.name = name;
    if (token != null) msg.token = token;
    this._send(msg);
  }

  /** 发送消息。除保留字段外原样转发给房间其他玩家（或交给服务端裁决）。 */
  send(payload) {
    this._send({ op: 'send', ...payload });
  }

  leave() {
    this._send({ op: 'leave' });
  }

  close() {
    if (this.ws) this.ws.close();
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.emit('raw', raw);
      return;
    }
    if (msg.op === 'joined') {
      this.id = msg.you;
      this.game = msg.game;
      this.room = msg.room;
    }
    this.emit(msg.op, msg); // 按 op 分发：joined / message / error / closed / peer_join / peer_leave
    this.emit('*', msg); // 兜底：所有服务端消息
  }

  _send(obj) {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('GameClient not connected');
    }
    this.ws.send(JSON.stringify(obj));
  }
}
