/**
 * 让框架仓库内能直接以 template/ 为游戏目录运行/测试：
 * 在 template/node_modules 里建一个指向框架根的符号链接，
 * 使 template/server 里的 `import 'simple-multi-server'` 可解析。
 * 幂等：已正确链接则跳过。
 */
import { mkdirSync, symlinkSync, rmSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModulesDir = resolve(root, 'template', 'node_modules');
const linkPath = resolve(nodeModulesDir, 'simple-multi-server');

mkdirSync(nodeModulesDir, { recursive: true });

try {
  const st = lstatSync(linkPath);
  if (st.isSymbolicLink() && readlinkSync(linkPath) === '../..') {
    // 已正确链接
    process.exit(0);
  }
  rmSync(linkPath, { recursive: true, force: true });
} catch {
  /* 不存在，继续创建 */
}

symlinkSync('../..', linkPath, 'dir');
console.log('[link-template] 已链接', linkPath, '->', resolve(nodeModulesDir, '../..'));
