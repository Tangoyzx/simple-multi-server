# simple-multi-server

轻量 WebSocket 网页游戏服务端框架。每款游戏是独立 git 仓库，通过 npm 依赖本框架。

- **权威裁决**：继承 `GameServer` 基类写服务端逻辑，服务端做裁判（防作弊）。
- **纯转发**：不写任何服务端代码，`send` 的消息在房间内自动转发（多参数，客户端自行解析）。
- **客户端基类**：框架统一托管 `/__engine/GameClient.js`，只做连接/收发。
- **本地多客户端测试**：`npm start` 后多开浏览器标签页即可对战。

## 快速体验（内置示例：井字棋）

```bash
npm install
npm run demo        # 启动 template/ 示例
# 打开 http://localhost:3000/ ，开两个标签页对战
```

## 开发一款新游戏

1. 复制模板：

```bash
cp -r template my-game && cd my-game
```

2. 把 `package.json` 依赖改为框架的 git 地址：

```jsonc
"dependencies": {
  "simple-multi-server": "git+https://github.com/Tangoyzx/simple-multi-server.git#v0.1.0"
}
```

3. 编辑 `game.json`、`server/index.js`（权威裁决，可删）、`client/index.html`。

4. 运行测试：

```bash
npm install
npm start          # 打开 http://localhost:3000/ ，多开标签页测试
```

## 游戏仓库结构

```
my-game/
├── game.json             # { name, title, entry, server?, maxPlayers? }
├── server/index.js       # 继承 GameServer 的裁决逻辑（删掉=纯转发）
├── client/index.html     # 客户端
└── package.json          # 依赖框架 + start 脚本
```

## GameServer 基类

```js
import { GameServer } from 'simple-multi-server';

export default class MyGame extends GameServer {
  async init() {}          // 引擎启动时一次
  async destroy() {}       // 引擎关闭时一次
  onCreate(room) {}        // 房间创建：初始化 room.state
  onJoin(room, player) {}
  onLeave(room, player) {}
  onMessage(room, player, message) {} // message 已去掉 op/game/room/token/from
}
```

- `room.state`：每房间独立状态（`onCreate` 里初始化）。
- `room` API：`id / game / state / players / broadcast(data, exclude?) / sendTo(id, data) / listPlayers() / close(reason)`。

## 客户端基类

游戏 HTML 引用框架托管的基类：

```html
<script type="module">
  import { GameClient } from '/__engine/GameClient.js';
  const c = new GameClient(`ws://${location.host}/ws`);
  c.on('joined', m => console.log('my id', m.you));
  c.on('message', m => console.log('recv', m));
  await c.connect();
  c.join({ game: 'mygame', room: 'default' });
  c.send({ type: 'hello' });
</script>
```

## 协议

WebSocket + JSON，默认 `/ws`。客户端 → 服务端：`join / leave / send`；服务端 → 客户端：`joined / peer_join / peer_leave / message / error / closed`。保留字段 `op/game/room/token/from`。完整契约见 `skills/simple-multi-server-game-dev/reference/protocol.md`。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `3000` | 端口 |
| `TOKEN` | 空 | 设置后 join 需携带相同 token |
| `LOG_LEVEL` | `info` | debug / info / warn / error / silent |

## 测试

```bash
npm test
```

## 公网部署

默认监听 `0.0.0.0:3000`。能否被公网访问取决于宿主机网络：

1. 云安全组放行入站 TCP `PORT`（腾讯云控制台 → 安全组）。
2. 系统防火墙同步放行（`ufw allow 3000/tcp`）。
3. 公网 IP 可执行 `curl http://metadata.tencentyun.com/latest/meta-data/public-ipv4` 获取。
4. 验证：外网访问 `http://<公网IP>:3000/health`。
