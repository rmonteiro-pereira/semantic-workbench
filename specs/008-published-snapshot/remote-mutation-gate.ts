import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isConnectionRetry } from '../../scripts/helpers/processes';
import { stopVite } from '../../scripts/ci-validate';

const output = join(process.cwd(), 'out', '008-remote-gate');
mkdirSync(output, { recursive: true });
mkdirSync('/tmp/sw-008', { recursive: true });
const configuration = join(output, 'vite.config.ts');
const source = JSON.stringify(join(process.cwd(), 'vite.config.ts'));
await Bun.write(
  configuration,
  `import config from ${source};
export default environment => {
  const base = config(environment);
  return {
    ...base,
    cacheDir: ${JSON.stringify(join(output, 'vite-cache'))},
    server: { ...base.server, port: 5481, proxy: { '/api': 'http://127.0.0.1:5482' } },
  };
};
`,
);
const frontend = Bun.spawn([process.execPath, 'x', 'vite-plus', 'dev', '--config', configuration, '--host', '127.0.0.1', '--strictPort', '--port', '5481'], {
  env: { ...process.env, DATA_DIR: join(output, 'data') },
  detached: true,
  stdout: Bun.file(join(output, 'frontend.log')),
  stderr: Bun.file(join(output, 'frontend-error.log')),
});
async function runGate(script: string, name: string) {
  const child = Bun.spawn([process.execPath, script], {
    env: { ...process.env, SW_BASE_URL: 'http://127.0.0.1:5481' },
    stdout: Bun.file(join(output, `${name}.log`)),
    stderr: Bun.file(join(output, `${name}-error.log`)),
  });
  const code = await child.exited;
  await Bun.write(join(output, `${name}.exit`), String(code));
  console.log(`${name}: exit ${code}`);
  if (code !== 0) throw new Error(`${name} failed; inspect its captured logs.`);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      ready = (await fetch('http://127.0.0.1:5481', { signal: AbortSignal.timeout(500) })).ok;
    } catch (error) {
      if (!isConnectionRetry(error)) throw error;
    }
    if (ready) break;
    await Bun.sleep(100);
  }
  if (!ready) throw new Error('The remote frontend did not become ready.');
  await runGate('scripts/published-snapshot-browser-check.ts', 'snapshot-browser');
  await runGate('scripts/ui-tests.ts', 'ui-browser');
  await runGate('scripts/mutation-tests.ts', 'mutation');
} finally {
  await stopVite(frontend);
}
