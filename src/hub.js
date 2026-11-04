import { Room } from './room.js';
import { Player } from './player.js';
import { config, logger } from './config.js';

/** 服务端保留字段：不会被转发，客户端不可伪造。 */
const RESERVED = new Set(['op', 'game', 'room', 'token', 'from']);

/**
 * Hub —— 连接与房间的管理中枢。
 * 职责：
 *  - 把每条 WebSocket 连接包装成 Player
 *  - 处理 join / leave / send
 *  - 房间按 `${game}/${room}` 隔离，空房间自动销毁
 *  - 已加载游戏的 game 名 → 交给其 GameServer 裁决；否则 → 纯转发（relay）
 */
export class Hub {
  /**
   * @param {{ name:string, dir:string, manifest:object, server:object|null }} game
   */
  constructor(game) {
    this.game = game;
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

  /** 返回该游戏名的裁决处理器（GameServer 实例）；null 表示纯转发。 */
  resolveServer(gameName) {
    return gameName === this.game.name ? this.game.server : null;
  }

  /** 返回该游戏名的房间人数上限；未加载/未知游戏不设限。 */
  resolveMaxPlayers(gameName) {
    if (gameName !== this.game.name) return null;
    const m = this.game.manifest.maxPlayers;
    return Number.isInteger(m) ? m : null;
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
    const server = this.resolveServer(gameName);
    const roomId = typeof msg.room === 'string' && msg.room ? msg.room : 'default';
    const key = `${gameName}/${roomId}`;

    // 容量校验（在加入前）
    const maxPlayers = this.resolveMaxPlayers(gameName);
    if (maxPlayers != null) {
      const existing = this.rooms.get(key);
      if (existing && existing.size() >= maxPlayers) {
        return player.send({ op: 'error', error: 'room is full' });
      }
    }

    let room = this.rooms.get(key);
    if (!room) {
      room = new Room(gameName, roomId);
      this.rooms.set(key, room);
      if (server && server.onCreate) server.onCreate(room);
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

    if (server && server.onJoin) server.onJoin(room, player);
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

    const server = this.resolveServer(player.game);
    if (server && server.onMessage) {
      server.onMessage(room, player, message);
    } else {
      // 纯转发：广播给房间内其他玩家，不回发给发送者
      room.broadcast({ op: 'message', from: player.id, ...message }, player.id);
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
      const server = this.resolveServer(game);
      room.removePlayer(player.id);
      player.attached = false;
      if (server && server.onLeave) server.onLeave(room, player);
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
