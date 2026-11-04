/**
 * 井字棋 —— 权威裁决示例：继承 GameServer 基类，服务端校验落子并判定胜负。
 *
 * 纯转发游戏则完全不需要这个文件（删掉 server/ 并去掉 game.json 里的 server 字段即可）。
 */
import { GameServer } from 'simple-multi-server';

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const SYMBOL = ['X', 'O'];

function checkWinner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function publicState(room) {
  const s = room.state;
  return {
    type: 'state',
    board: s.board,
    turn: s.turn,
    turnPlayerId: s.turn === null ? null : s.seats[s.turn],
    winner: s.winner,
    started: s.started,
    seats: s.seats.map((playerId, seat) => ({ seat, symbol: SYMBOL[seat], playerId })),
  };
}

function broadcastState(room) {
  room.broadcast({ op: 'message', from: 'server', ...publicState(room) });
}

function sendError(player, message) {
  player.send({ op: 'error', error: message });
}

export default class TicTacToe extends GameServer {
  onCreate(room) {
    const s = room.state;
    s.board = Array(9).fill(null);
    s.seats = [null, null]; // seat 0 = X, seat 1 = O
    s.turn = null;
    s.winner = null;
    s.started = false;
  }

  onJoin(room, player) {
    const s = room.state;
    const seat = s.seats[0] === null ? 0 : s.seats[1] === null ? 1 : null;
    if (seat === null) {
      sendError(player, 'room is full');
      return;
    }
    s.seats[seat] = player.id;
    if (s.seats[0] !== null && s.seats[1] !== null) {
      // 两名玩家到齐，开始新一局
      s.board = Array(9).fill(null);
      s.winner = null;
      s.started = true;
      s.turn = 0;
    }
    broadcastState(room);
  }

  onLeave(room, player) {
    const s = room.state;
    const seat = s.seats.indexOf(player.id);
    if (seat === -1) return;
    s.seats[seat] = null;
    // 进行中有人退出 → 另一方判胜
    if (s.started && !s.winner) {
      const other = 1 - seat;
      if (s.seats[other] !== null) {
        s.winner = SYMBOL[other];
        s.turn = null;
        s.started = false;
      }
    }
    broadcastState(room);
  }

  onMessage(room, player, message) {
    const s = room.state;

    if (message.type === 'restart') {
      s.board = Array(9).fill(null);
      s.winner = null;
      s.turn = s.started ? 0 : null;
      broadcastState(room);
      return;
    }

    if (message.type !== 'move') return; // 不处理的消息直接忽略（不会自动转发）

    const seat = s.seats.indexOf(player.id);
    if (seat === -1) return sendError(player, 'not seated');
    if (!s.started || s.winner) return sendError(player, 'game is not active');
    if (s.turn !== seat) return sendError(player, 'not your turn');

    const i = message.index;
    if (!Number.isInteger(i) || i < 0 || i > 8) return sendError(player, 'invalid index');
    if (s.board[i] !== null) return sendError(player, 'cell is occupied');

    s.board[i] = SYMBOL[seat];

    const win = checkWinner(s.board);
    if (win) {
      s.winner = win;
      s.turn = null;
    } else if (s.board.every((c) => c !== null)) {
      s.winner = 'draw';
      s.turn = null;
    } else {
      s.turn = 1 - seat;
    }
    broadcastState(room);
  }
}
