# SimpleMultiServer 通信协议

WebSocket 上的 JSON 文本。所有消息为单个 JSON 对象。

## 端点

| 端点 | 说明 |
| --- | --- |
| `ws://<host>:3000/ws` | WebSocket 连接（路径可用环境变量覆盖，默认 `/ws`） |
| `http://<host>:3000/health` | 健康检查（`{ok, game, protocolVersion, rooms}`） |
| `http://<host>:3000/__engine/GameClient.js` | 框架客户端基类（游戏 HTML 引用它） |

## 保留字段

`op`、`game`、`room`、`token`、`from` 为服务端保留字段：
- 客户端发送时，`op/game/room/token` 用于控制与定位，不会被转发；
- `from` 由服务端填写，客户端传入的值会被丢弃。

## 客户端 → 服务端

### join

```jsonc
{ "op": "join", "game": "relay", "room": "default", "name": "可选", "token": "可选" }
```

- `game`：游戏名。已注册的游戏走其服务端逻辑；未注册的自动按 `relay` 处理。默认 `relay`。
- `room`：房间 id。同 `game+room` 的客户端互为房间成员。默认 `default`。
- `name`：可选昵称，展示用。
- `token`：若服务端设置了共享密钥则必填。
- 若玩家已在其他房间，会先自动 `leave` 再加入新房间。

### leave

```jsonc
{ "op": "leave" }
```

### send

```jsonc
{ "op": "send", "type": "任意", "x": 1, "payload": {}, "任意字段": "任意值" }
```

- 除保留字段外的**所有字段**会被：
  - 纯转发游戏：原样广播给房间内其他玩家，附加 `from`；
  - 带逻辑游戏：交给服务端模块处理，模块决定返回什么。
- 字段语义由客户端双方约定，服务端不解释。

## 服务端 → 客户端

| op | 触发时机 | 关键字段 |
| --- | --- | --- |
| `joined` | 加入房间成功 | `game` `room` `you`（自己 id） `peers`（`[{id,name}]`） |
| `peer_join` | 有他人加入 | `peer`（`{id,name}`） |
| `peer_leave` | 有他人离开 | `peer`（`{id,name}`） |
| `message` | 转发/服务端消息 | `from`（发送者 id 或 `"server"`）+ 业务字段 |
| `error` | 出错 | `error`（描述） |
| `closed` | 房间被关闭 | `reason` |

### message 示例

纯转发：

```jsonc
{ "op": "message", "from": "<发送者id>", "type": "hello", "text": "hi", "x": 1 }
```

服务端状态类游戏：

```jsonc
{ "op": "message", "from": "server", "type": "state", "board": [...], "turn": 0 }
```

## 错误语义

| error 内容 | 含义 |
| --- | --- |
| `invalid JSON` | 消息不是合法 JSON |
| `invalid token` | token 不匹配 |
| `join a room first` | 未 join 就 send |
| `room is full` | 超过游戏模块的 maxPlayers |
| `room no longer exists` | 房间已被销毁 |
| `unknown op: ...` | 未知 op |

## 井字棋（tictactoe，带逻辑示例）

- `maxPlayers: 2`，座位 0 = X，座位 1 = O，先手 X。
- 客户端发：
  - `{ "op": "send", "type": "move", "index": 0 }`（index 0–8）
  - `{ "op": "send", "type": "restart" }`
- 服务端广播状态：

```jsonc
{
  "op": "message", "from": "server", "type": "state",
  "board": [null, "X", null, ...],   // 长度 9
  "turn": 1,                          // 当前轮到哪个 seat（0/1）
  "turnPlayerId": "<id>",             // 当前轮到的玩家 id
  "winner": null,                     // null | "X" | "O" | "draw"
  "started": true,
  "seats": [ { "seat": 0, "symbol": "X", "playerId": "<id>" }, ... ]
}
```

- 非法落子（非自己回合 / 格子已占用 / 游戏未开始）会收到 `error`（`not your turn` / `cell is occupied` / `game is not active`）。

## 鉴权

服务端若设置环境变量 `TOKEN`，则所有 `join` 必须携带相同 `token`，否则 `error: invalid token`。

## 协议版本

- `GET /health` 返回 `protocolVersion`（当前 `1`）。
- 游戏客户端/服务端可据此做兼容判断；协议不兼容时应明确报错，避免"莫名出错"。
- 当前 `joined` 消息不含 `protocolVersion`；如需，以 `/health` 返回值为准。
