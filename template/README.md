# 游戏模板

这是 `simple-multi-server` 框架的**起步模板**：复制本目录，就得到一个独立的游戏仓库。模板里是一套完整可玩的井字棋，演示如何写**服务端裁决**的游戏；你以它为起点改成自己的游戏即可。

## 快速开始（复制成独立游戏仓库）

```bash
cp -r SimpleMultiServer/template snake      # 复制模板为新游戏
cd snake
npm install                                 # 装框架依赖（含 ws）
npm start                                   # 打开 http://localhost:3000/ 多开标签页测试
```

> 模板已自带 `.gitignore`（忽略 `node_modules/`），也已在 `package.json` 里按 git 地址依赖框架，所以 `npm install && npm start` 直接可用。

## 目录结构

```
my-game/
├── game.json             # 游戏清单（框架据此启动）
├── package.json          # 依赖框架 + start 脚本
├── .gitignore            # 忽略 node_modules
├── server/
│   └── index.js          # 服务端裁决逻辑（继承 GameServer）
└── client/
    └── index.html        # 客户端（引用框架的 /__engine/GameClient.js）
```

## 依赖框架

游戏通过 npm 依赖框架 `simple-multi-server`：

| 场景 | package.json 依赖 |
| --- | --- |
| 默认（发布/共享，模板已配好） | `"simple-multi-server": "git+https://github.com/Tangoyzx/simple-multi-server.git#v0.1.0"` |
| 本机开发（框架就在隔壁目录，改动即时生效） | `"simple-multi-server": "file:../SimpleMultiServer"` |

## game.json 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 游戏唯一 id，也是 `join` 时的 `game`、房间命名依据 |
| `title` | 否 | 展示名（默认用 `name`） |
| `entry` | 是 | 客户端入口文件（相对游戏根） |
| `server` | 否 | 服务端模块路径；**省略 = 纯转发**（无需写任何服务端代码） |
| `maxPlayers` | 否 | 房间人数上限 |

```jsonc
{
  "name": "tictactoe",
  "title": "井字棋",
  "entry": "client/index.html",
  "server": "server/index.js",
  "maxPlayers": 2
}
```

## 服务端：继承 GameServer 写裁决逻辑

```js
import { GameServer } from 'simple-multi-server';

export default class MyGame extends GameServer {
  async init() {}                 // 引擎启动时一次（可选）
  async destroy() {}              // 引擎关闭时一次（可选）
  onCreate(room) {}               // 房间创建：初始化 room.state
  onJoin(room, player) {}         // 玩家加入
  onLeave(room, player) {}        // 玩家离开
  onMessage(room, player, message) {} // 收到消息（已去掉 op/game/room/token/from）
}
```

**room API**（在钩子内使用）：

| 成员 | 说明 |
| --- | --- |
| `room.id` / `room.game` | 房间标识 |
| `room.state` | 每房间独立可变状态，在 `onCreate` 里初始化 |
| `room.players` | `Map<playerId, Player>` |
| `room.broadcast(data, excludePlayerId?)` | 广播给房间所有人（可排除某人） |
| `room.sendTo(playerId, data)` | 发给指定玩家 |
| `room.listPlayers()` | 返回 `[{id, name}]` |
| `room.close(reason)` | 关闭房间并通知所有人 |

模板里的 `server/index.js` 就是完整示例：座位分配、轮流、非法落子拒绝、胜负/平局判定、断线判负。

## 客户端：引用框架客户端基类

```html
<script type="module">
  import { GameClient } from '/__engine/GameClient.js';
  const c = new GameClient(`ws://${location.host}/ws`);
  c.on('joined', m => console.log('我的 id:', m.you));
  c.on('message', m => { /* 处理消息：纯转发或服务端消息 */ });
  c.on('error', m => console.warn(m.error));
  await c.connect();
  c.join({ game: 'mygame', room: 'default' });
  c.send({ type: 'move', index: 0 });
</script>
```

**GameClient 方法**：`connect() / join({game,room,name,token}) / send(payload) / leave() / close()`。

**事件**：`open / joined / message / error / closed / peer_join / peer_leave / wsError / *`。

## 写纯转发游戏

删掉 `server/` 目录，并把 `game.json` 里的 `"server"` 字段去掉即可——不写任何服务端代码，`send` 的消息会在房间内自动转发给其他玩家（不回发给发送者）。

## 协议要点

- 传输：WebSocket + JSON，默认路径 `/ws`。
- 客户端 → 服务端：`{op:"join"} / {op:"leave"} / {op:"send", ...任意字段}`。
- 服务端 → 客户端：`joined / peer_join / peer_leave / message / error / closed`。
- 保留字段：`op / game / room / token / from`（`from` 由服务端填写）。
- 完整字段与错误语义见框架仓库 `skills/simple-multi-server-game-dev/reference/protocol.md`。

## 本地多客户端测试

同一地址开多个标签页即为多个客户端。权威裁决游戏由服务端校验，客户端无法作弊。房间号可用 URL 参数区分：`http://localhost:3000/?room=room-A`。
