// Runs the real relay program against a test server with the scripted reference agent as the agent it hosts.
import { mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Script } from '../../../scripts/acp-reference-agent';
import type { PanelServer } from './panel-server';

/** A running relay with what it printed, so a test can check what it never printed. */
export type RelayProcess = Awaited<ReturnType<typeof startRelay>>;

/** Starts the relay for a session the browser already started. */
export async function startRelay(server: PanelServer, started: { id: string; code: string }, script: Script, extraEnvironment: Record<string, string> = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'acp-relay-test-'));
  const scriptPath = join(folder, 'script.json');
  writeFileSync(scriptPath, JSON.stringify(script));
  const argv = ['bun', 'scripts/acp-relay.ts', '--session', `${started.id}.${started.code}`, '--url', server.url, '--', 'bun', 'scripts/acp-reference-agent.ts', scriptPath];
  const child = Bun.spawn(argv, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env: { ...process.env, DATA_DIR: server.root, ...extraEnvironment } });
  const output: string[] = [];
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) output.push(new TextDecoder().decode(chunk));
  };
  void collect(child.stdout);
  void collect(child.stderr);
  return {
    child,
    argv,
    output: () => output.join(''),
    /** Ports this process and its children listen on. A relay must have none. */
    listeningPorts(): number[] {
      const inodes = new Set<string>();
      for (const pid of [child.pid, ...childrenOf(child.pid)]) {
        try {
          for (const name of readdirSync(`/proc/${pid}/fd`)) {
            const target = readlinkSync(`/proc/${pid}/fd/${name}`);
            if (target.startsWith('socket:[')) inodes.add(target.slice(8, -1));
          }
        } catch {
          /* The process may have exited. */
        }
      }
      const listening: number[] = [];
      for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
        for (const line of readFileSync(table, 'utf8').split('\n').slice(1)) {
          const columns = line.trim().split(/\s+/);
          if (columns[3] === '0A' && inodes.has(columns[9])) listening.push(parseInt(columns[1].split(':')[1], 16));
        }
      }
      return listening;
    },
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([child.exited, Bun.sleep(5000)]);
      child.kill('SIGKILL');
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

function childrenOf(pid: number): number[] {
  try {
    return readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}
