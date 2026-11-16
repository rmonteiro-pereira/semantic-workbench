import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isConnectionRetry } from './helpers/processes';
import { stopVite } from './ci-validate';

const output = join(process.cwd(), 'out', '008-review-gate');
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
async function runGate(args: string[], name: string, environment: Record<string, string> = {}, allowFailure = false) {
  await Bun.write(join(output, `${name}.log`), '');
  await Bun.write(join(output, `${name}-error.log`), '');
  const child = Bun.spawn([process.execPath, ...args], {
    detached: true,
    env: { ...process.env, ...environment, SW_BASE_URL: 'http://127.0.0.1:5481' },
    stdout: Bun.file(join(output, `${name}.log`)),
    stderr: Bun.file(join(output, `${name}-error.log`)),
  });
  let code: number;
  try {
    code = await child.exited;
  } finally {
    await stopVite(child);
  }
  await Bun.write(join(output, `${name}.exit`), String(code));
  console.log(`${name}: exit ${code}`);
  if (code !== 0 && !allowFailure) throw new Error(`${name} failed; inspect its captured logs.`);
  return code;
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
  for (const command of ['test:published-snapshot', 'test:ui', 'test:edges', 'test:grouping-validation', 'test:examples:ui', 'test:scm', 'test:mappings-layout', 'test:projects', 'test:auth']) {
    const captures = command === 'test:published-snapshot' ? { SW_SCREENSHOT_DIR: join(output, 'publication-captures') } : {};
    await runGate(['--bun', 'run', command], command.replaceAll(':', '-'), captures);
  }
  await runGate(['scripts/polish-capture.ts', join(output, 'capture-local')], 'capture-local');
  await runGate(['scripts/polish-capture-server.ts', join(output, 'capture-server')], 'capture-server');
  const responsive = await runGate(['scripts/responsive-ui-tests.ts'], 'responsive', {}, true);
  if (responsive !== 0) {
    const failure = await Bun.file(join(output, 'responsive-error.log')).text();
    if (!failure.includes('mall.odcs.yaml canvas height') || !/Expected:\s*>= 421/.test(failure) || !/Received:\s*407/.test(failure)) {
      throw new Error('The responsive suite failed outside its documented inherited 407/421 exception.');
    }
    console.log('responsive: inherited mall canvas 407/421 exception reproduced');
    for (const group of ['dark theme:', 'graph canvases:', 'shell screens:', 'examples: 1440', 'examples: 2560', 'sidebar: the phone drawer']) {
      await runGate(['scripts/responsive-ui-tests.ts'], `responsive-${group.replaceAll(/[^a-z0-9]+/gi, '-')}`, { RESPONSIVE_ONLY: group });
    }
  }
  await runGate(['scripts/mutation-tests.ts'], 'mutation');
} finally {
  await stopVite(frontend);
}
