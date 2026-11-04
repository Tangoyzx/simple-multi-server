# 示例游戏：井字棋（权威裁决）

这是 `simple-multi-server` 框架的起步模板，展示如何写一款**服务端裁决**的游戏。

## 在仓库内直接运行（演示）

```bash
# 在框架仓库根目录
npm run demo
```

然后浏览器打开 `http://localhost:3000/`，开两个标签页即可对战。

## 复制成独立游戏仓库

```bash
cp -r template my-game && cd my-game
```

把 `package.json` 里的依赖从 `file:..` 改成框架的 git 地址：

```json
"dependencies": {
  "simple-multi-server": "git+https://github.com/Tangoyzx/simple-multi-server.git#v0.1.0"
}
```

然后：

```bash
npm install
npm start        # 打开 http://localhost:3000/ 多开标签页测试
```

## 目录说明

```
my-game/
├── game.json             # 清单：name/title/entry/server/maxPlayers
├── server/index.js       # 继承 GameServer 的裁决逻辑（可删 → 纯转发）
├── client/index.html     # 客户端（引用 /__engine/GameClient.js）
└── package.json          # 依赖框架 + start 脚本
```

## 写纯转发游戏

删掉 `server/` 目录，并把 `game.json` 里的 `"server": "server/index.js"` 字段去掉即可——不写任何服务端代码，`send` 的消息会在房间内自动转发。

## 客户端要点

- 引入框架客户端基类：`import { GameClient } from '/__engine/GameClient.js'`
- `new GameClient(ws://主机/ws)` → `connect()` → `join({game, room})` → `send({type, ...})`
- 监听 `joined` / `message` / `error` / `closed` 等事件。
