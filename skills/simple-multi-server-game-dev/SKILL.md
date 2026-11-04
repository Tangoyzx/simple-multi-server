---
name: simple-multi-server-game-dev
description: Use when developing a web game on the simple-multi-server framework — creating game.json, writing authoritative server logic by extending the GameServer base class, or building the browser client with the /__engine/GameClient.js base.
---

# simple-multi-server 游戏开发

为 **simple-multi-server**（轻量 WebSocket 网页游戏服务端框架）开发一款游戏的操作指南。每款游戏是独立 git 仓库，通过 npm 依赖框架。

## 核心事实

- 框架是 npm 包 `simple-multi-server`，游戏代码用 `import { GameServer } from 'simple-multi-server'` 继承基类。
- 游戏仓库通过 `package.json` 依赖框架：

```jsonc
{
  "type": "module",
  "scripts": { "start": "simple-multi-server" },
  "dependencies": { "simple-multi-server": "git+https://github.com/Tangoyzx/simple-multi-server.git#v0.1.0" }
}
```

- 本地开发：`npm install && npm start` → 打开 `http://localhost:3000/`，多开标签页即可多客户端测试。

## 游戏仓库结构

```
my-game/
├── game.json             # 清单
├── server/index.js       # 可选：权威裁决（extends GameServer）；删掉=纯转发
├── client/index.html     # 客户端
└── package.json          # 依赖框架 + start 脚本
```

### game.json

```jsonc
{
  "name": "tictactoe",          // 唯一 id：join 的 game 字段、房间命名
  "title": "井字棋",            // 展示名
  "entry": "client/index.html", // 客户端入口（相对游戏根）
  "server": "server/index.js",  // 可选；省略 = 纯转发
  "maxPlayers": 2               // 可选
}
```

## 服务端：继承 GameServer 写裁决逻辑

```js
import { GameServer } from 'simple-multi-server';

export default class MyGame extends GameServer {
  async init() {}                 // 引擎启动时一次（可选）
  async destroy() {}              // 引擎关闭时一次（可选）
  onCreate(room) {}               // 房间创建：初始化 room.state
  onJoin(room, player) {}
  onLeave(room, player) {}
  onMessage(room, player, message) {} // message 已去掉 op/game/room/token/from
}
```

- `room.state`：每房间独立可变状态（在 `onCreate` 里初始化）。
- `room` API：`id/game/state/players/broadcast(data,exclude?)/sendTo(id,data)/listPlayers()/close(reason)`。
- 完整可运行示例见框架仓库的 `template/`（井字棋）。

## 客户端：引用框架客户端基类

```html
<script type="module">
  import { GameClient } from '/__engine/GameClient.js';
  const c = new GameClient(`ws://${location.host}/ws`);
  c.on('joined', m => {/* m.you 是自身 id */});
  c.on('message', m => {/* 转发或服务端消息 */});
  c.on('error', m => {/* 错误 */});
  await c.connect();
  c.join({ game: 'mygame', room: 'default', name: 'alice' });
  c.send({ type: 'move', index: 0 });
</script>
```

- `GameClient` 提供：`connect()/join()/send()/leave()/close()` + `on/off` 事件（`open/joined/message/error/closed/peer_join/peer_leave/wsError/*`）。

## 协议摘要

- 传输：WebSocket + JSON 文本，默认 `/ws`。
- 客户端 → 服务端：`{op:"join"}` / `{op:"leave"}` / `{op:"send", ...任意字段}`。
- 服务端 → 客户端：`joined / peer_join / peer_leave / message / error / closed`。
- 保留字段：`op/game/room/token/from`（`from` 服务端填写，客户端无法伪造）。
- 纯转发：`send` 的字段原样广播给房间其他玩家（不回发发送者），附加 `from`。
- 权威裁决：消息交给 `GameServer.onMessage`，由服务端决定返回。
- 未知游戏名回退为纯转发；`TOKEN` 环境变量开启 join 鉴权。
- 完整字段与错误语义见 `reference/protocol.md`。

## 本地多客户端测试

同一房间地址开多个标签页即为多个客户端（房间号可用 `?room=xxx` 区分）。权威裁决游戏由服务端校验，客户端不可作弊。

## 参考

- `reference/protocol.md` —— 完整协议契约。
- `reference/GameClient.js` —— 客户端基类快照（与框架 `/__engine/GameClient.js` 同步）。
- `examples/relay_client.js` —— Node 最小示例。
