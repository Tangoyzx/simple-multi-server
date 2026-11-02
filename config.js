/**
 * 集中式配置：全部从环境变量读取，带合理默认值。
 * 避免在业务代码里散落魔法值。
 */

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const config = {
  // 监听地址：公网可达必须为 0.0.0.0
  host: process.env.HOST || '0.0.0.0',
  // 监听端口（本机 8080 已被占用，默认用 3000）
  port: intFromEnv('PORT', 3000),
  // 可选共享密钥：设置后客户端 join 必须携带相同 token，防公网滥用
  token: process.env.TOKEN || null,
  // 日志级别：debug | info | warn | error | silent
  logLevel: process.env.LOG_LEVEL || 'info',
  // WebSocket 路径
  wsPath: '/ws',
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export const logger = {
  debug(...args) {
    if (LEVELS[config.logLevel] <= LEVELS.debug) console.log('[debug]', ...args);
  },
  info(...args) {
    if (LEVELS[config.logLevel] <= LEVELS.info) console.log('[info]', ...args);
  },
  warn(...args) {
    if (LEVELS[config.logLevel] <= LEVELS.warn) console.warn('[warn]', ...args);
  },
  error(...args) {
    if (LEVELS[config.logLevel] <= LEVELS.error) console.error('[error]', ...args);
  },
};
