#!/usr/bin/env node
import { resolve } from 'node:path';
import { startServer } from './index.js';

// 用法：simple-multi-server [游戏目录]，默认当前目录（游戏根，含 game.json）
const gameDir = resolve(process.argv[2] || '.');

startServer({ gameDir })
  .then((handle) => {
    const shutdown = async () => {
      await handle.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((err) => {
    console.error('[simple-multi-server] 启动失败:', err.message);
    process.exit(1);
  });
