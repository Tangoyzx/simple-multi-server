/**
 * relay —— 纯转发游戏（也是所有未注册游戏名的默认回退）。
 * relay:true 表示 Hub 会把所有 send 的原样字段广播给房间内其他玩家。
 * 多参数、字段由客户端自定义并自行解析。
 */
export default {
  name: 'relay',
  relay: true,
};
