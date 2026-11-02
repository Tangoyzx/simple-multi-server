---
name: simple-multi-server-client
description: Use when writing a web-game client that talks to the SimpleMultiServer WebSocket game server (联机网页游戏服务端) — joining rooms, forwarding messages, or adding a new game. Covers the join/send/leave JSON protocol, the reference GameClient, and the stateful tictactoe example.
---

# SimpleMultiServer 客户端开发

为 **SimpleMultiServer**（一个轻量、支持多款游戏、带转发的 WebSocket 网页游戏服务器）编写客户端时的操作指南。

## 服务器核心事实

- 传输：**WebSocket + JSON 文本**。
- 默认路径：`/ws`；默认端口：`3000`（`ws://<host>:3000/ws`）。
- 健康检查（探测存活/端口是否可达）：`GET /health`。
- 服务端保留字段（客户端无法伪造，会被剥离）：`op` `game` `room` `token` `from`。
  - `from` 由服务端填写为发送者 id。

## 第一步：确认契约

1. 拿到服务器地址（由用户提供，形如 `ws://<host>:3000/ws`）。
2. 若服务器提供 `GET /meta`，**优先请求它**，以返回的 `protocolVersion`、鉴权要求、`games` 列表、消息 schema 为准，覆盖本文件默认值。
3. 若没有 `/meta`（当前版本未实现），使用 `reference/protocol.md` 里的默认契约。

> 约定：本技能内嵌的是"稳定知识"；IP/端口/token/游戏列表/协议版本等易变信息应尽量运行时获取，不要写死。

## 协议摘要

客户端 → 服务端：

```jsonc
{ "op": "join", "game": "relay", "room": "default", "name": "可选", "token": "可选" }
{ "op": "leave" }
{ "op": "send", "type": "任意", "x": 1, "payload": {}, "任意字段": "任意值" }
```

服务端 → 客户端：

```jsonc
{ "op": "joined",     "game": "...", "room": "...", "you": "<你的id>", "peers": [{"id","name"}...] }
{ "op": "peer_join",  "peer": {"id","name"} }
{ "op": "peer_leave", "peer": {"id","name"} }
{ "op": "message",    "from": "<发送者id或server>", ...转发的字段或服务端发出的字段 }
{ "op": "error",      "error": "..." }
{ "op": "closed",     "reason": "..." }
```

要点：
- **转发**：`send` 里除保留字段外的**所有字段**原样广播给同房间**其他**玩家（不回发给发送者），并附加 `from:<发送者id>`。
- **多参数**：字段完全由客户端自定义、自行解析，服务端不解释。
- **未知游戏名**：自动回退为纯转发（`relay`），无需服务端改动。
- **带逻辑的游戏**（如 `tictactoe`）：由服务端主动发 `{op:"message", from:"server", ...}`，客户端据此更新状态。

完整字段表、错误语义、井字棋示例见 `reference/protocol.md`。

## 客户端最小流程

1. 建立 WebSocket 连接到 `/ws`。
2. 发送 `join`，等待 `joined`（拿到 `you`，即自己的 id）。
3. 发送 `send`；在 `message` 事件里按 `from` 与业务字段处理。
4. 结束或离开时发 `leave` 或直接断开。

## 参考实现

- `reference/GameClient.js` —— 浏览器原生 ESM 客户端，可直接复制进网页游戏项目（也支持注入 Node 的 `ws`）。
- `reference/GameClient.d.ts` —— 类型定义。
- `examples/relay_client.js` —— Node 最小可运行示例（连 → join → send → 收）。

## 注意事项

- **鉴权**：若服务器设置了 `TOKEN`，`join` 必须携带相同 `token`，否则收到 `error: invalid token`。
- **先 join 再 send**：未 join 就 send 会收到 `error: join a room first`。
- **房间隔离**：同游戏不同 `room` 互不串消息；房间空则自动销毁。
- **协议版本**：当前 `joined` 不含 `protocolVersion`；后续版本若加入，请以 `/meta` 或 `joined` 返回值为准做兼容判断。
