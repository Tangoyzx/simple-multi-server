# SimpleMultiServer

轻量、可扩展、支持多款游戏、可在公网访问的网页游戏 WebSocket 服务端。

- **纯转发**：同一房间内的客户端之间转发任意 JSON 消息（多参数，字段由客户端自定义并自行解析）。
- **多游戏 + 隔离**：通过 `game` 名称区分游戏，房间按 `游戏名/房间id` 完全隔离；未注册的游戏名自动回退为纯转发。
- **带状态/带逻辑**：支持注册服务端逻辑的游戏模块（示例：井字棋），每个房间拥有独立状态。
- **公网可达**：默认监听 `0.0.0.0`，提供 `/health` 健康检查。

技术栈：Node.js（原生 ESM）+ `ws`，无框架。并发极低（≤ 2 客户端）场景够用。

## 快速开始

```bash
npm install
npm start          # 默认监听 0.0.0.0:3000
```

- 测试页面：http://127.0.0.1:3000/
- 健康检查：http://127.0.0.1:3000/health
- WebSocket：`ws://127.0.0.1:3000/ws`

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址（公网访问需为 0.0.0.0） |
| `PORT` | `3000` | 监听端口 |
| `TOKEN` | 空 | 设置后客户端 join 必须携带相同 `token`，防止公网滥用 |
| `LOG_LEVEL` | `info` | debug / info / warn / error / silent |

## 通信协议

WebSocket 上的 JSON 文本。服务端保留字段：`op`、`game`、`room`、`token`、`from`（`from` 由服务端填写，客户端无法伪造）。

### 客户端 → 服务端

```jsonc
{ "op": "join", "game": "relay", "room": "default", "name": "可选昵称", "token": "可选" }
{ "op": "leave" }
{ "op": "send", "type": "任意", "x": 1, "payload": {}, "任意字段": "任意值" }
```

- `send` 会把除保留字段外的**所有字段**原样转发（多参数），客户端自行解析。

### 服务端 → 客户端

```jsonc
{ "op": "joined",    "game": "...", "room": "...", "you": "<你的id>", "peers": [{"id","name"}...] }
{ "op": "peer_join",  "peer": {"id","name"} }
{ "op": "peer_leave", "peer": {"id","name"} }
{ "op": "message", "from": "<发送者id或server>", ...转发的字段或游戏模块发出的字段 }
{ "op": "error",   "error": "..." }
{ "op": "closed",  "reason": "..." }
```

纯转发时，服务端把 `send` 的字段加上 `from:<发送者id>` 后，以 `op:"message"` 广播给房间内**其他**玩家（不回发给发送者）。带逻辑的游戏则由服务端主动发出 `op:"message"`（`from:"server"`）。

## 如何新增一个游戏

1. 在 `src/games/` 下新建 `<name>.js`：

```js
export default {
  name: 'mygame',
  relay: false,       // true = 纯转发（所有 send 自动广播）
  maxPlayers: 4,      // 可选，房间人数上限

  onCreate(room) {},  // 房间首次创建时初始化 room.state
  onJoin(room, player) {},
  onLeave(room, player) {},
  onMessage(room, player, message) {}, // message 已去掉 op/game/room/token
};
```

2. 在 `src/games/index.js` 里登记：

```js
import mygame from './mygame.js';
export const games = { relay, tictactoe, mygame };
```

3. 重启即可。客户端 `join` 时把 `game` 填为 `"mygame"`。

### Room API（隔离边界）

| 成员 | 说明 |
| --- | --- |
| `room.id` / `room.game` / `room.key` | 房间标识 |
| `room.state` | 每房间独立可变状态对象（在 `onCreate` 里初始化） |
| `room.players` | `Map<playerId, Player>` |
| `room.broadcast(data, excludePlayerId?)` | 向房间内所有（除 exclude 外）玩家发送 |
| `room.sendTo(playerId, data)` | 向指定玩家发送 |
| `room.listPlayers()` | 返回 `[{id, name}]` |
| `room.close(reason)` | 关闭房间并通知所有玩家 |

> 隔离保证：房间键为 `游戏名/房间id`；`room.state` 每次新建；模块之间无共享可变状态。

## 公网访问（部署到公网）

服务默认监听 `0.0.0.0:3000`，但能否被公网连上取决于宿主机的网络配置。请按顺序检查：

1. **确认监听**：启动日志会打印本地与公网地址；或执行
   ```bash
   curl http://127.0.0.1:3000/health
   ```
2. **云安全组（关键）**：本机为腾讯云 CVM，需在 [腾讯云控制台](https://console.cloud.tencent.com/) → 该实例 → **安全组** 中，放行 **入站 TCP 端口 `3000`**（来源可设为 `0.0.0.0/0`，或限定为客户端 IP 以更安全）。
3. **系统防火墙**：若开启了 `ufw` / `iptables`，需同步放行，例如 `ufw allow 3000/tcp`。
4. **验证**：从外网（另一台设备 / 手机流量）访问 `http://<公网IP>:3000/` 或
   ```bash
   curl http://<公网IP>:3000/health
   ```
5. **如用 NAT/端口映射**：把公网某端口映射到本机 `3000`。

> 公网 IP 可在云控制台查看，或执行 `curl http://metadata.tencentyun.com/latest/meta-data/public-ipv4` 获取。安全组是云控制台操作，无法在代码内完成，需要你手动放行端口。

## 测试

```bash
npm test    # 运行集成测试（两个 ws 客户端模拟转发、隔离、井字棋逻辑等）
```
