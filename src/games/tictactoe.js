/**
 * tictactoe —— 带服务端状态与逻辑的示例游戏（井字棋，2 人）。
 *
 * 演示如何扩展一个“带逻辑”的游戏模块：
 *  - onCreate  初始化每房间独立状态 room.state
 *  - onJoin    分配座位（X/O）、两人到齐后开局
 *  - onLeave   处理中途退出（另一方判胜）
 *  - onMessage 校验落子、判定胜负、广播最新状态
 *
 * 状态结构（存在 room.state，房间之间互相隔离）：
 *  - board:  长度为 9 的数组，值为 null | 'X' | 'O'
 *  - seats:  [playerId, playerId]，seat 0 = 'X'，seat 1 = 'O'
 *  - turn:   当前轮到哪个 seat（0 或 1），null 表示不在进行中
 *  - winner: null | 'X' | 'O' | 'draw'
 *  - started: 是否已开局
 */

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
    seats: s.seats.map((playerId, seat) => ({
      seat,
      symbol: SYMBOL[seat],
      playerId,
    })),
  };
}

function broadcastState(room) {
  room.broadcast({ op: 'message', from: 'server', ...publicState(room) });
}

function error(player, message) {
  player.send({ op: 'error', error: message });
}

export default {
  name: 'tictactoe',
  relay: false,
  maxPlayers: 2,

  onCreate(room) {
    room.state.board = Array(9).fill(null);
    room.state.seats = [null, null];
    room.state.turn = null;
    room.state.winner = null;
    room.state.started = false;
  },

  onJoin(room, player) {
    const s = room.state;
    const seat = s.seats[0] === null ? 0 : s.seats[1] === null ? 1 : null;
    if (seat === null) {
      error(player, 'room is full');
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
  },

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
  },

  onMessage(room, player, message) {
    const s = room.state;

    if (message.type === 'restart') {
      s.board = Array(9).fill(null);
      s.winner = null;
      s.turn = s.started ? 0 : null;
      broadcastState(room);
      return;
    }

    if (message.type !== 'move') {
      // 该游戏不处理的消息直接忽略（relay:false 表示不会自动转发）
      return;
    }

    const seat = s.seats.indexOf(player.id);
    if (seat === -1) return error(player, 'not seated');

    if (!s.started || s.winner) {
      return error(player, 'game is not active');
    }
    if (s.turn !== seat) {
      return error(player, 'not your turn');
    }

    const i = message.index;
    if (!Number.isInteger(i) || i < 0 || i > 8) {
      return error(player, 'invalid index');
    }
    if (s.board[i] !== null) {
      return error(player, 'cell is occupied');
    }

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
  },
};
