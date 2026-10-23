// Building the real Azure exporters, which happens only when telemetry is on, must not contact
// anyone: not Microsoft's usage-reporting endpoint, not the cloud metadata address, and not the
// ingestion host until there is something to send.
import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');

test('constructing and shutting down the exporters opens no connection', async () => {
  const probe = resolve(root, 'tests/observability/azure-backends-probe.ts');
  const child = Bun.spawn([process.execPath, probe], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, SW_LOG_LEVEL: 'silent' },
  });
  const output = await new Response(child.stdout).text();
  const errors = await new Response(child.stderr).text();
  expect(await child.exited, errors).toBe(0);
  expect(JSON.parse(output.trim().split('\\n').at(-1)!)).toEqual({ attempts: [] });
});
