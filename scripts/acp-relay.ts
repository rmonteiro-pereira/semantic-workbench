// Hosts the agent a person chose and carries its protocol messages to the workbench over HTTP. It starts the agent as its own child, opens no port, and holds no workbench file except, in local mode, the capability file it reads for each request.
// Usage: bun scripts/acp-relay.ts --session <id>.<code> [--url <workbench address>] -- <agent command and arguments>
// Local mode reads DATA_DIR (default data) for the capability. Server mode reads the single-use credential from SW_ACP_CREDENTIAL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLines } from './acp-event-parser';
import { startRelayLink } from './acp-relay-link';
import { exchangeCredential } from './acp-relay-token';

const DEFAULT_URL = `http://127.0.0.1:${process.env.SW_PORT || 4310}`;
const TERMINATE_GRACE_MS = 3_000;

/** The parts of the command line the relay needs. */
export type RelayArguments = { sessionId: string; code: string; url: string; command: string[] };

/** Reads the command line. Returns a sentence for the person when it is wrong. */
export function parseRelayArguments(argv: readonly string[]): RelayArguments | string {
  const separator = argv.indexOf('--');
  const options = separator < 0 ? argv : argv.slice(0, separator);
  const command = separator < 0 ? [] : argv.slice(separator + 1);
  const value = (name: string) => options[options.indexOf(name) + 1];
  const session = options.includes('--session') ? value('--session') : undefined;
  const match = /^([A-Za-z0-9_-]{1,64})\.([A-Z2-9]{8})$/.exec(session ?? '');
  if (!match) return 'Give the session shown in the panel: --session <id>.<code>';
  if (command.length === 0) return 'Give the agent command after --, for example: -- my-agent --acp';
  const url = options.includes('--url') ? value('--url') : DEFAULT_URL;
  if (!/^https?:\/\/[^\s/]+$/.test(url)) return 'The --url value must be an address without a path, such as http://127.0.0.1:4310';
  return { sessionId: match[1], code: match[2], url, command };
}

async function main(): Promise<number> {
  const parsed = parseRelayArguments(process.argv.slice(2));
  if (typeof parsed === 'string') {
    console.error(parsed);
    return 2;
  }
  let bearer: () => string;
  const credential = process.env.SW_ACP_CREDENTIAL;
  if (credential) {
    delete process.env.SW_ACP_CREDENTIAL;
    const token = await exchangeCredential(parsed.url, credential);
    if (!token) {
      console.error('The workbench did not accept the connection credential. Start a new session in the panel.');
      return 1;
    }
    bearer = token.current;
  } else {
    const capabilityFile = join(process.env.DATA_DIR || 'data', 'state', 'mcp-capability');
    bearer = () => readFileSync(capabilityFile, 'utf8').trim();
  }

  const agent = Bun.spawn(parsed.command, { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit', env: { ...process.env, SW_ACP_CREDENTIAL: undefined } });
  let finished: (code: number) => void = () => {};
  const done = new Promise<number>(resolve => (finished = resolve));
  const link = startRelayLink({
    baseUrl: parsed.url,
    sessionId: parsed.sessionId,
    code: parsed.code,
    bearer,
    toAgent: line => {
      agent.stdin.write(line + '\n');
      agent.stdin.flush();
    },
    onEnded: message => {
      console.error(message);
      agent.kill();
      finished(0);
    },
  });
  if (!(await link.hello())) {
    console.error('The workbench did not accept the session. Check the code, and start a new session in the panel if it was used or has expired.');
    agent.kill();
    return 1;
  }
  console.error('Connected. Leave this running while you use the agent panel.');

  // The agent's last lines must reach the workbench before the goodbye, so the exit waits for the output to end.
  const outputDone = (async () => {
    for await (const line of readLines(agent.stdout)) if (line.trim()) link.send(line);
  })();
  void agent.exited.then(async code => {
    await outputDone;
    console.error(`The agent exited with code ${code}.`);
    await link.stop('agent-exited');
    finished(code === 0 ? 0 : 1);
  });
  const interrupt = async () => {
    // One TERM to the child, then a kill if it lingers.
    agent.kill('SIGTERM');
    setTimeout(() => agent.kill('SIGKILL'), TERMINATE_GRACE_MS).unref();
    await link.stop('closed');
    finished(0);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  return done;
}

if (import.meta.main) process.exit(await main());
