// Runs the API and frontend development servers and shuts them down together.
import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import { waitForApi } from './api-readiness';

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

// The API listens only after it has recovered and scanned the workspace, which can take several
// seconds on a large workspace or a slow disk. Starting Vite first made its proxy fail every early
// request with ECONNREFUSED, so the frontend waits until the API reports ready.
const apiReadyTimeoutMs = 120_000;
const apiPort = process.env.SW_PORT || '4310';

const services: Service[] = [];

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

function watch({ name, child }: Service): void {
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

function launch(name: string, args: string[]): Service {
  const service = start(name, args);
  services.push(service);
  watch(service);
  return service;
}

async function startServices(): Promise<void> {
  const api = launch('API', ['--hot', 'src/server/index.ts']);

  console.log('[dev] Waiting for the API to be ready...');
  const result = await waitForApi({
    url: `http://127.0.0.1:${apiPort}/readyz`,
    timeoutMs: apiReadyTimeoutMs,
    intervalMs: 250,
    isApiRunning: () => api.child.exitCode === null && !stopping,
  });

  if (result === 'api-exited') return;
  if (result === 'timed-out') {
    console.error(`[dev] The API was not ready after ${apiReadyTimeoutMs / 1000} s.`);
    stop(1);
    return;
  }

  console.log('[dev] API ready');
  launch('Vite++', ['x', 'vite-plus', 'dev', '--host', '127.0.0.1', '--strictPort']);
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

void startServices();
