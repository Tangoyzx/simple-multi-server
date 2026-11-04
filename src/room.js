import { logger } from './config.js';

/**
 * 一个房间 = 一个游戏实例的一次对局。
 * 房间之间完全隔离：每个房间拥有独立的 state 与 players。
 * 房间键为 `${game}/${id}`，由 Hub 保证同键复用、不同键隔离。
 */
export class Room {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    this.key = `${game}/${id}`;
    this.state = {}; // 每房间独立可变状态，由游戏模块 onCreate 初始化
    this.players = new Map(); // playerId -> Player
  }

  addPlayer(player) {
    this.players.set(player.id, player);
    player.game = this.game;
    player.room = this.id;
    player.attached = true;
  }

  removePlayer(playerId) {
    return this.players.delete(playerId);
  }

  isEmpty() {
    return this.players.size === 0;
  }

  size() {
    return this.players.size;
  }

  /** 向指定玩家发送。 */
  sendTo(playerId, data) {
    const p = this.players.get(playerId);
    if (p) p.send(data);
  }

  /** 向房间内所有玩家广播；可用 excludePlayerId 排除某玩家（如发送者）。 */
  broadcast(data, excludePlayerId) {
    for (const [id, p] of this.players) {
      if (id !== excludePlayerId) p.send(data);
    }
  }

  listPlayers() {
    return [...this.players.values()].map((p) => p.toPublic());
  }

  /** 关闭整个房间：通知所有玩家并断开连接。 */
  close(reason) {
    logger.debug('room close', this.key, 'reason=', reason || '(none)');
    const data = { op: 'closed', reason: reason || 'room closed' };
    for (const p of this.players.values()) {
      p.send(data);
      try {
        p.ws.close(1000, reason || 'room closed');
      } catch {
        /* ignore */
      }
    }
    this.players.clear();
  }
}
