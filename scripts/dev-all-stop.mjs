#!/usr/bin/env node
/**
 * 停止 `npm run dev:all:persist` 启动的前后端进程。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const devDir = path.join(process.cwd(), '.dev');
const pidFile = path.join(devDir, 'dev-all.pids.json');

if (!fs.existsSync(pidFile)) {
  console.log('[dev-all-stop] 未找到运行中的开发服务（无 .dev/dev-all.pids.json）');
  process.exit(0);
}

/** @type {{ name: string; pid: number }[]} */
let entries;
try {
  entries = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
} catch {
  console.error('[dev-all-stop] PID 文件损坏，请手动结束占用 3000/3001 端口的进程');
  process.exit(1);
}

for (const { name, pid } of entries) {
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[dev-all-stop] 已发送 SIGTERM → ${name} (pid ${pid})`);
  } catch {
    console.log(`[dev-all-stop] ${name} (pid ${pid}) 已不在运行`);
  }
}

try {
  fs.unlinkSync(pidFile);
} catch {
  /* ignore */
}

console.log('[dev-all-stop] 完成。若端口仍被占用，可执行: lsof -i :3000 -i :3001');
