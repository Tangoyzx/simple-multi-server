import { Room } from './room.js';
import { Player } from './player.js';
import { config, logger } from '../config.js';

/** 服务端保留字段：不会被转发，客户端不可伪造。 */
const RESERVED = new Set(['op', 'game', 'room', 'token', 'from']);

/**
 * RelayHub —— 连接与房间的管理中枢。
 * 职责：
 *  - 把每条 WebSocket 连接包装成 Player
 *  - 处理 join / leave / send
 *  - 房间按 `${game}/${room}` 隔离，空房间自动销毁
 *  - 纯转发（relay）游戏：把 send 的多参数字段原样广播
 *  - 带逻辑游戏：把消息交给模块 onMessage 处理
 */
export class Hub {
  constructor(registry) {
    this.registry = registry;
    this.rooms = new Map(); // key -> Room
  }

  roomCount() {
    return this.rooms.size;
  }

  handleConnection(ws) {
    const player = new Player(ws);
    ws.on('message', (raw) => this.handleMessage(player, raw));
    ws.on('close', () => this.handleLeave(player));
    ws.on('error', () => {
      /* close 事件会负责清理 */
    });
    return player;
  }

  handleMessage(player, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return player.send({ op: 'error', error: 'invalid JSON' });
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      return player.send({ op: 'error', error: 'message must be a JSON object' });
    }
    try {
      switch (msg.op) {
        case 'join':
          this.handleJoin(player, msg);
          break;
        case 'leave':
          this.handleLeave(player);
          break;
        case 'send':
          this.handleSend(player, msg);
          break;
        default:
          player.send({ op: 'error', error: `unknown op: ${msg.op ?? '(none)'}` });
      }
    } catch (err) {
      logger.error('message handling error:', err);
      player.send({ op: 'error', error: `server error: ${err.message}` });
    }
  }

  handleJoin(player, msg) {
    if (config.token && msg.token !== config.token) {
      return player.send({ op: 'error', error: 'invalid token' });
    }
    // 已加入其他房间 → 先退出
    if (player.attached) {
      this.handleLeave(player);
    }

    const gameName = typeof msg.game === 'string' && msg.game ? msg.game : 'relay';
    const module = this.registry.resolve(gameName);
    const roomId = typeof msg.room === 'string' && msg.room ? msg.room : 'default';
    const key = `${gameName}/${roomId}`;

    // 容量校验（在加入前）
    if (module.maxPlayers != null) {
      const existing = this.rooms.get(key);
      if (existing && existing.size() >= module.maxPlayers) {
        return player.send({ op: 'error', error: 'room is full' });
      }
    }

    let room = this.rooms.get(key);
    if (!room) {
      room = new Room(gameName, roomId);
      this.rooms.set(key, room);
      if (module.onCreate) module.onCreate(room);
      logger.debug('room created', key);
    }

    player.name = typeof msg.name === 'string' && msg.name ? msg.name : null;
    room.addPlayer(player);

    player.send({
      op: 'joined',
      game: gameName,
      room: roomId,
      you: player.id,
      peers: room.listPlayers().filter((p) => p.id !== player.id),
    });
    room.broadcast({ op: 'peer_join', peer: player.toPublic() }, player.id);

    if (module.onJoin) module.onJoin(room, player);
  }

  handleSend(player, msg) {
    if (!player.attached) {
      return player.send({ op: 'error', error: 'join a room first' });
    }
    const key = `${player.game}/${player.room}`;
    const room = this.rooms.get(key);
    if (!room) {
      return player.send({ op: 'error', error: 'room no longer exists' });
    }

    // 去掉保留字段，其余字段（多参数）原样保留，由客户端自行解析
    const message = {};
    for (const [k, v] of Object.entries(msg)) {
      if (!RESERVED.has(k)) message[k] = v;
    }

    const module = this.registry.resolve(player.game);
    if (module.relay) {
      room.broadcast({ op: 'message', from: player.id, ...message }, player.id);
    } else if (module.onMessage) {
      module.onMessage(room, player, message);
    }
  }

  handleLeave(player) {
    if (!player.attached) {
      player.game = null;
      player.room = null;
      return;
    }
    const key = `${player.game}/${player.room}`;
    const room = this.rooms.get(key);
    const game = player.game;

    if (room) {
      const module = this.registry.resolve(game);
      room.removePlayer(player.id);
      player.attached = false;
      if (module.onLeave) module.onLeave(room, player);
      room.broadcast({ op: 'peer_leave', peer: player.toPublic() });
      if (room.isEmpty()) {
        this.rooms.delete(key);
        logger.debug('room destroyed', key);
      }
    }

    player.game = null;
    player.room = null;
  }
}
