/**
 * 游戏注册表：在这里登记新的游戏模块即可。
 * key 建议与模块的 name 一致。
 */
import relay from './relay.js';
import tictactoe from './tictactoe.js';

export const games = {
  relay,
  tictactoe,
};
