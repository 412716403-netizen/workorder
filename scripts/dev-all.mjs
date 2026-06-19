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
 *  - `--persist`：子进程脱离终端独立运行，父进程立即退出；适合 IDE 后台终端
 *    超时 SIGTERM 导致「用着用着掉线」的场景。停止请用 `npm run dev:stop`。
 */
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const isMac = process.platform === 'darwin';
const projectRoot = process.cwd();
const persistMode = process.argv.includes('--persist');
const devDir = path.join(projectRoot, '.dev');
const pidFile = path.join(devDir, 'dev-all.pids.json');

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

function warnIfAlreadyRunning() {
  if (!fs.existsSync(pidFile)) return false;
  try {
    const entries = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
    const alive = entries.filter(({ pid }) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (alive.length > 0) {
      console.warn(
        `\n\u001b[33m[dev-all] 检测到已有持久化开发服务在运行:\n` +
          alive.map(({ name, pid }) => `  - ${name} pid ${pid}`).join('\n') +
          `\n  请先执行 npm run dev:stop，或访问 http://localhost:3000\u001b[0m\n`,
      );
      return true;
    }
    fs.unlinkSync(pidFile);
  } catch {
    /* 损坏的 pid 文件，继续启动 */
  }
  return false;
}

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 1000;

const services = [
  {
    name: 'web',
    color: '\u001b[34m', // blue
    cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['vite'],
    cwd: projectRoot,
  },
  {
    name: 'api',
    color: '\u001b[35m', // magenta
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev', '--prefix', 'backend'],
    cwd: projectRoot,
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

function startPersist(service) {
  fs.mkdirSync(devDir, { recursive: true });
  const logPath = path.join(devDir, `${service.name}.log`);
  const logFd = fs.openSync(logPath, 'a');
  const header = `\n--- ${new Date().toISOString()} [dev-all:persist] starting ${service.name} ---\n`;
  fs.writeSync(logFd, header);

  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd,
    env: process.env,
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  child.unref();
  fs.closeSync(logFd);
  return { name: service.name, pid: child.pid };
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
  if (reason === 'SIGTERM') {
    console.log(
      '[dev-all] 提示: 若由 IDE 后台终端超时导致掉线，请改用 npm run dev:all:persist 启动，' +
        '停止用 npm run dev:stop。',
    );
  }
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

function startCaffeinatePersist() {
  if (!isMac) return null;
  try {
    const child = spawn('caffeinate', ['-dimsu'], {
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    return { name: 'caffeinate', pid: child.pid };
  } catch {
    return null;
  }
}

function runPersistMode() {
  if (warnIfAlreadyRunning()) {
    process.exit(0);
  }

  warnIfForeignListener(3001);
  warnIfForeignListener(3000);

  const pids = services.map(startPersist);
  const caf = startCaffeinatePersist();
  if (caf) pids.push(caf);

  fs.mkdirSync(devDir, { recursive: true });
  fs.writeFileSync(pidFile, JSON.stringify(pids, null, 2));

  console.log('[dev-all:persist] 前后端已在后台独立运行（脱离当前终端）:');
  console.log('  前端  http://localhost:3000');
  console.log('  后端  http://localhost:3001');
  console.log(`  日志  ${devDir}/web.log  ${devDir}/api.log`);
  console.log('  停止  npm run dev:stop');
  if (isMac && caf) {
    console.log('[dev-all:persist] caffeinate 已启动（阻止 macOS 休眠）。');
  }
  process.exit(0);
}

if (persistMode) {
  runPersistMode();
} else {
  if (isMac) {
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
}
