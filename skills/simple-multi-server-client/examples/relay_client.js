/**
 * relay_client.js —— Node 最小可运行示例。
 *
 * 依赖：ws（npm install ws），以及同目录上层的 reference/GameClient.js。
 *
 * 运行：node examples/relay_client.js
 * 作用：连上服务器 → 加入 relay/demo 房间 → 发一条消息 → 打印收到的所有消息。
 */
import { WebSocket } from 'ws';
import { GameClient } from '../reference/GameClient.js';

const URL = process.env.SERVER_URL || 'ws://127.0.0.1:3000/ws';
const GAME = process.env.GAME || 'relay';
const ROOM = process.env.ROOM || 'demo';
const NAME = process.env.NAME || 'node-bot';

const client = new GameClient(URL, { WebSocketImpl: WebSocket });

client.on('joined', (m) => console.log(`[joined] my id=${m.you}, peers=${JSON.stringify(m.peers)}`));
client.on('peer_join', (m) => console.log(`[peer_join] ${JSON.stringify(m.peer)}`));
client.on('peer_leave', (m) => console.log(`[peer_leave] ${JSON.stringify(m.peer)}`));
client.on('message', (m) => console.log(`[message] from=${m.from} data=${JSON.stringify(m)}`));
client.on('error', (m) => console.log(`[error] ${m.error}`));
client.on('wsError', (e) => console.log(`[wsError] ${e.message || e}`));

await client.connect();
console.log('[connect] ok,', URL);
client.join({ game: GAME, room: ROOM, name: NAME });
client.send({ type: 'hello', text: 'hi from node', ts: Date.now() });

// 停留 5 秒观察收到的消息后退出
setTimeout(() => {
  client.close();
  process.exit(0);
}, 5000);
