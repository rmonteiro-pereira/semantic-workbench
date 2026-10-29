// With telemetry off the SDK and the Azure exporter are never loaded and no connection is made.
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const FORBIDDEN_AT_START = /^(@opentelemetry\/(sdk-|resources|context-async-hooks)|@azure\/monitor-opentelemetry-exporter)/;

async function runProbe(control: boolean) {
  const probe = resolve(root, 'tests/observability/telemetry-off-probe.ts');
  const child = Bun.spawn([process.execPath, probe], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, SW_LOG_LEVEL: 'silent', PROBE_CONTROL: control ? '1' : '0' },
  });
  const output = await new Response(child.stdout).text();
  const errors = await new Response(child.stderr).text();
  expect(await child.exited, errors).toBe(0);
  return JSON.parse(output.trim().split('\n').at(-1)!) as { attempts: string[]; loaded: string[] };
}

test('starting telemetry off, in local mode, without a string and with one, loads no SDK', async () => {
  const result = await runProbe(false);
  expect(result.attempts).toEqual([]);
  expect(result.loaded).toEqual([]);
});

test('the probe does see an SDK module when one is loaded', async () => {
  const result = await runProbe(true);
  expect(result.loaded.length).toBeGreaterThan(0);
});

test('nothing the server imports at start reaches the SDK except through the telemetry loader', () => {
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  const seen = new Set<string>();
  const reached: string[] = [];
  function visit(file: string) {
    if (seen.has(file)) return;
    seen.add(file);
    const imports = transpiler.scanImports(readFileSync(file, 'utf8'));
    for (const entry of imports) {
      if (entry.kind === 'dynamic-import') continue;
      if (entry.path.startsWith('.')) {
        const base = resolve(dirname(file), entry.path);
        const target = [base, `${base}.ts`, `${base}/index.ts`].find(path => existsSync(path) && path.endsWith('.ts'));
        if (target) visit(target);
      } else if (FORBIDDEN_AT_START.test(entry.path)) {
        reached.push(`${file.replace(root, '')} -> ${entry.path}`);
      }
    }
  }
  visit(resolve(root, 'src/server/index.ts'));
  expect(reached).toEqual([]);
  expect(seen.size).toBeGreaterThan(50);
});

test('the only dynamic loads of the SDK are in the telemetry starter and its two loaders', () => {
  const starter = readFileSync(resolve(root, 'src/server/observability/telemetry.ts'), 'utf8');
  expect(starter).toContain("await import('./pipeline')");
  expect(starter).toContain("await import('./azure-backends')");
});

test('the exporter loader is the only file that names the Azure exporter', () => {
  const loader = readFileSync(resolve(root, 'src/server/observability/azure-backends.ts'), 'utf8');
  expect(loader).toContain("await import('@azure/monitor-opentelemetry-exporter')");
});
