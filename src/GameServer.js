/**
 * GameServer —— 游戏服务端基类。
 *
 * 权威裁决类游戏继承它并覆写需要的钩子；纯转发游戏无需任何服务端代码。
 * 每个游戏房间拥有独立的 room.state（在 onCreate 里初始化），房间之间完全隔离。
 */
export class GameServer {
  /**
   * @param {{ name: string, dir: string, manifest: object }} game
   */
  constructor(game) {
    this.game = game;
    this.name = game.name;
  }

  /** 引擎启动时调用一次（可异步）。 */
  async init() {}

  /** 引擎关闭时调用一次（可异步）。 */
  async destroy() {}

  /** 房间创建时调用：在这里初始化 room.state。 */
  onCreate(room) {}

  /** 玩家加入房间时调用。 */
  onJoin(room, player) {}

  /** 玩家离开房间时调用。 */
  onLeave(room, player) {}

  /**
   * 收到玩家消息时调用。
   * message 已去掉 op/game/room/token/from 等保留字段，其余字段原样保留。
   */
  onMessage(room, player, message) {}
}
