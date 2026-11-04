import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { startServer } from '../src/index.js';
import { config } from '../src/config.js';

config.logLevel = 'silent';

const gameDir = fileURLToPath(new URL('../template', import.meta.url));

let srv;
let base;

before(async () => {
  srv = await startServer({ host: '127.0.0.1', port: 0, gameDir });
  base = `ws://127.0.0.1:${srv.port}/ws`;
});

after(async () => {
  await srv.close();
});

/** 简易 ws 测试客户端：维护收件箱，支持按条件等待消息（消费一次即移除）。 */
function makeClient(ws) {
  const client = {
    ws,
    inbox: [],
    waiters: [],
    send(obj) {
      this.ws.send(JSON.stringify(obj));
    },
    push(msg) {
      for (let i = 0; i < this.waiters.length; i++) {
        const w = this.waiters[i];
        if (w.pred(msg)) {
          this.waiters.splice(i, 1);
          clearTimeout(w.timer);
          w.resolve(msg);
          return;
        }
      }
      this.inbox.push(msg);
    },
    waitFor(pred, timeout = 2000) {
      const idx = this.inbox.findIndex(pred);
      if (idx >= 0) {
        const [msg] = this.inbox.splice(idx, 1);
        return Promise.resolve(msg);
      }
      return new Promise((resolveWait, rejectWait) => {
        const waiter = { pred, resolve: resolveWait, timer: null };
        waiter.timer = setTimeout(() => {
          const i = this.waiters.indexOf(waiter);
          if (i >= 0) this.waiters.splice(i, 1);
          rejectWait(new Error('timeout waiting for message'));
        }, timeout);
        this.waiters.push(waiter);
      });
    },
    close() {
      this.ws.close();
    },
  };
  ws.on('message', (raw) => client.push(JSON.parse(raw.toString())));
  return client;
}

function connect(url) {
  return new Promise((resolveConnect, rejectConnect) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolveConnect(makeClient(ws)));
    ws.on('error', rejectConnect);
  });
}

test('纯转发：未知游戏名回退，多参数转发且不回发给发送者', async () => {
  const a = await connect(base);
  const b = await connect(base);
  a.send({ op: 'join', game: 'relay', room: 'r1' });
  b.send({ op: 'join', game: 'relay', room: 'r1' });
  const ja = await a.waitFor((m) => m.op === 'joined');
  await b.waitFor((m) => m.op === 'joined');

  a.send({ op: 'send', type: 'hello', a: 1, b: 'x', c: [1, 2, 3], nested: { k: 'v' } });

  const got = await b.waitFor((m) => m.op === 'message');
  assert.equal(got.from, ja.you);
  assert.equal(got.type, 'hello');
  assert.equal(got.a, 1);
  assert.equal(got.b, 'x');
  assert.deepEqual(got.c, [1, 2, 3]);
  assert.deepEqual(got.nested, { k: 'v' });

  await assert.rejects(a.waitFor((m) => m.op === 'message', 300), /timeout/);
  a.close();
  b.close();
});

test('隔离：不同房间互不串消息', async () => {
  const a = await connect(base);
  const b = await connect(base);
  const c = await connect(base);
  a.send({ op: 'join', game: 'relay', room: 'r1' });
  b.send({ op: 'join', game: 'relay', room: 'r1' });
  c.send({ op: 'join', game: 'relay', room: 'r2' });
  await a.waitFor((m) => m.op === 'joined');
  await b.waitFor((m) => m.op === 'joined');
  await c.waitFor((m) => m.op === 'joined');

  a.send({ op: 'send', type: 'secret', value: 42 });
  const gotB = await b.waitFor((m) => m.op === 'message');
  assert.equal(gotB.value, 42);
  await assert.rejects(c.waitFor((m) => m.op === 'message', 300), /timeout/);
  a.close();
  b.close();
  c.close();
});

test('权威裁决：井字棋轮流与校验', async () => {
  const a = await connect(base);
  const b = await connect(base);
  a.send({ op: 'join', game: 'tictactoe', room: 'tt1' });
  b.send({ op: 'join', game: 'tictactoe', room: 'tt1' });
  const ja = await a.waitFor((m) => m.op === 'joined');
  const jb = await b.waitFor((m) => m.op === 'joined');

  const st = await a.waitFor((m) => m.op === 'message' && m.type === 'state' && m.started === true);
  const first = st.turnPlayerId === ja.you ? a : b;
  const second = first === a ? b : a;
  const secondId = first === a ? jb.you : ja.you;

  // 后手先下 → 被拒
  second.send({ op: 'send', type: 'move', index: 0 });
  const err = await second.waitFor((m) => m.op === 'error');
  assert.match(err.error, /not your turn/);

  // 先手下 0 号格
  first.send({ op: 'send', type: 'move', index: 0 });
  const st2 = await first.waitFor((m) => m.op === 'message' && m.type === 'state' && m.board[0] !== null);
  assert.equal(st2.board[0], 'X');
  assert.equal(st2.turnPlayerId, secondId);

  // 后手试图下已占用格 → 被拒
  second.send({ op: 'send', type: 'move', index: 0 });
  const err2 = await second.waitFor((m) => m.op === 'error');
  assert.match(err2.error, /occupied/);
  a.close();
  b.close();
});

test('权威裁决：井字棋胜负判定', async () => {
  const a = await connect(base);
  const b = await connect(base);
  a.send({ op: 'join', game: 'tictactoe', room: 'tt2' });
  b.send({ op: 'join', game: 'tictactoe', room: 'tt2' });
  const ja = await a.waitFor((m) => m.op === 'joined');
  const jb = await b.waitFor((m) => m.op === 'joined');

  const st = await a.waitFor((m) => m.op === 'message' && m.type === 'state' && m.started === true);
  const x = st.turnPlayerId === ja.you ? a : b;
  const o = x === a ? b : a;

  const script = [
    [x, 0],
    [o, 3],
    [x, 1],
    [o, 4],
    [x, 2],
  ];
  let last;
  for (const [who, idx] of script) {
    who.send({ op: 'send', type: 'move', index: idx });
    last = await a.waitFor((m) => m.op === 'message' && m.type === 'state' && m.board[idx] !== null);
  }
  assert.equal(last.winner, 'X');
  a.close();
  b.close();
});

test('HTTP：/health 与静态资源带 no-store', async () => {
  const health = await (await fetch(`http://127.0.0.1:${srv.port}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.game, 'tictactoe');
  assert.equal(health.protocolVersion, 1);

  const root = await fetch(`http://127.0.0.1:${srv.port}/`);
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type') || '', /text\/html/);
  assert.equal(root.headers.get('cache-control'), 'no-store');

  const clientLib = await fetch(`http://127.0.0.1:${srv.port}/__engine/GameClient.js`);
  assert.equal(clientLib.status, 200);
  assert.equal(clientLib.headers.get('cache-control'), 'no-store');
});
