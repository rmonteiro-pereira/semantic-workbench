// Runs the API and frontend development servers and shuts them down together.
import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

type Service = {
  name: string;
  child: ChildProcess;
};

function start(name: string, args: string[]): Service {
  console.log(`[dev] Starting ${name}`);
  console.log(`[dev] Command: bun ${args.join(' ')}`);

  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    detached: false,
    windowsHide: true,
  });

  return { name, child };
}

const services: Service[] = [
  start('API', ['--hot', 'server/index.ts']),

  start('Vite++', ['x', 'vite-plus', 'dev', '--host', '127.0.0.1', '--strictPort']),
];

let stopping = false;

function stop(code = 0): void {
  if (stopping) return;
  stopping = true;

  console.log('\n[dev] Stopping services...');

  for (const { name, child } of services) {
    if (child.exitCode === null && !child.killed) {
      console.log(`[dev] Stopping ${name} (PID ${child.pid})`);
      child.kill('SIGTERM');
    }
  }

  process.exitCode = code;
}

for (const { name, child } of services) {
  child.on('spawn', () => {
    console.log(`[dev] ${name} started (PID ${child.pid})`);
  });

  child.on('error', error => {
    console.error(`[dev] ${name} failed to start:`);
    console.error(error);
    stop(1);
  });

  child.on('exit', (code, signal) => {
    console.log(`[dev] ${name} exited: code=${code ?? 'none'}, signal=${signal ?? 'none'}`);

    if (!stopping) {
      stop(code ?? 1);
    }
  });
}

process.on('SIGINT', () => {
  console.log('\n[dev] Ctrl+C received');
  stop(0);
});

process.on('SIGTERM', () => {
  console.log('\n[dev] SIGTERM received');
  stop(0);
});

process.on('uncaughtException', error => {
  console.error('[dev] Uncaught exception:');
  console.error(error);
  stop(1);
});

process.on('unhandledRejection', reason => {
  console.error('[dev] Unhandled rejection:');
  console.error(reason);
  stop(1);
});
