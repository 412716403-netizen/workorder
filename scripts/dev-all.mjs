#!/usr/bin/env node
/**
 * 启动前端 (vite) 与后端 (tsx watch)，并在 macOS 上自动阻止系统休眠，
 * 解决 "笔记本合盖 / 空闲睡眠后 Vite 被 SIGTERM 掉，前端报
 * Failed to fetch dynamically imported module" 的问题。
 *
 * 额外能力：
 *  - 任一子进程异常退出时，会自动重启（最多 5 次，1s 间隔），避免一次偶发
 *    崩溃就要手动重来。
 *  - 按 Ctrl+C 时，一次性干净地把所有子进程都收掉。
 */
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import process from 'node:process';

const isMac = process.platform === 'darwin';
const projectRoot = process.cwd();

/** 3001 被其它目录的旧后端占用时，本仓库 API 绑不上端口，Vite 代理仍会打到旧服务 → /api/dev/* 404 */
function warnIfForeignListener(port) {
  try {
    const pids = execSync(`lsof -i :${port} -sTCP:LISTEN -t 2>/dev/null`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const pid of pids) {
      let cwd = '';
      try {
        cwd = execSync(`lsof -p ${pid} 2>/dev/null | awk '/cwd/ {print $9; exit}'`, { encoding: 'utf8' }).trim();
      } catch {
        cwd = '';
      }
      if (cwd && !cwd.startsWith(projectRoot)) {
        console.warn(
          `\n\u001b[33m[dev-all] 警告: 端口 ${port} 已被其它项目占用 (PID ${pid})。\n` +
            `  目录: ${cwd}\n` +
            `  请先结束旧进程 (kill ${pid})，否则本仓库 API 无法监听 ${port}，开发管理等新接口会 404。\u001b[0m\n`,
        );
      }
    }
  } catch {
    /* 无占用或 lsof 不可用 */
  }
}

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 1000;

const services = [
  {
    name: 'web',
    color: '\u001b[34m', // blue
    cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['vite'],
    cwd: process.cwd(),
  },
  {
    name: 'api',
    color: '\u001b[35m', // magenta
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev', '--prefix', 'backend'],
    cwd: process.cwd(),
  },
];

const RESET = '\u001b[0m';

let shuttingDown = false;
const running = new Map();

function log(service, line) {
  const prefix = `${service.color}[${service.name}]${RESET}`;
  process.stdout.write(`${prefix} ${line}`);
  if (!line.endsWith('\n')) process.stdout.write('\n');
}

function pipe(stream, service) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      log(service, line + '\n');
    }
  });
  stream.on('end', () => {
    if (buf) log(service, buf + '\n');
  });
}

function start(service) {
  if (shuttingDown) return;
  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  running.set(service.name, child);
  pipe(child.stdout, service);
  pipe(child.stderr, service);
  child.on('exit', (code, signal) => {
    running.delete(service.name);
    log(service, `exited code=${code} signal=${signal || '-'}\n`);
    if (shuttingDown) {
      checkAllDown();
      return;
    }
    service.restarts = (service.restarts || 0) + 1;
    if (service.restarts > MAX_RESTARTS) {
      log(service, `restart limit reached, not restarting.\n`);
      shutdown('child-exhausted');
      return;
    }
    log(service, `restarting in ${RESTART_DELAY_MS}ms (attempt ${service.restarts}/${MAX_RESTARTS})...\n`);
    setTimeout(() => start(service), RESTART_DELAY_MS);
  });
}

function checkAllDown() {
  if (running.size === 0) {
    if (caffeinate && !caffeinate.killed) {
      try { caffeinate.kill('SIGTERM'); } catch {}
    }
    process.exit(0);
  }
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[dev-all] shutting down (${reason})...`);
  for (const [, child] of running) {
    try { child.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => {
    for (const [, child] of running) {
      try { child.kill('SIGKILL'); } catch {}
    }
    checkAllDown();
  }, 3000);
}

let caffeinate = null;
if (isMac) {
  // -d 阻止显示休眠, -i 阻止系统空闲休眠, -m 阻止磁盘休眠, -s 阻止系统休眠（AC 时生效）
  // -w <pid> 只在本进程存活期间生效
  try {
    caffeinate = spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], {
      stdio: 'ignore',
      detached: false,
    });
    caffeinate.on('error', () => {
      caffeinate = null;
    });
    console.log('[dev-all] caffeinate 已启动（阻止 macOS 休眠）。');
  } catch {
    caffeinate = null;
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

warnIfForeignListener(3001);
warnIfForeignListener(3000);

for (const s of services) start(s);
