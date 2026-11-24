import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { meshWorkspace } from '../helpers/mesh-workspace';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;

async function invoke(fixture: Fixture, path: string, body: object) {
  return fixture.fixture.handler(
    new Request('http://localhost:4310/api/projects/retail/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function publish(fixture: Fixture) {
  fixture.addPersonalBranch('retail');
  fixture.addUncommittedImport();
  const preview = await invoke(fixture, 'dependencies/update', { baseHash: null });
  const lock = await invoke(fixture, 'dependencies/update', { baseHash: null, confirm: (await preview.json()).preview });
  expect(lock.status).toBe(200);
  fixture.git('retail', ['add', '-A']);
  fixture.git('retail', ['commit', '-qm', 'Commit the consumer and lock']);
  expect((await invoke(fixture, 'git/publish', {})).status).toBe(200);
}

test.each(['shared', 'separate'] as const)('CLI reads the frozen provider from the published %s repository layout', async shape => {
  using fixture = await meshWorkspace(shape);
  await publish(fixture);
  const repository = join(fixture.ws.layout.projects, fixture.ws.repoOf('retail'));
  const out = join(fixture.fixture.root, 'compiled');
  const args = ['bun', 'scripts/tessera.ts', 'compile', '--repository', repository, '--out', out, '--json'];
  if (shape === 'shared') args.push('--project-folder', 'retail');
  if (shape === 'separate') {
    const refused = Bun.spawnSync(args);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toContain('--data-root');
    expect(existsSync(out)).toBe(false);
    args.push('--data-root', fixture.fixture.root);
  }
  const result = Bun.spawnSync(args);
  const body = JSON.parse(result.stdout.toString());
  if (result.exitCode !== 0) throw new Error(JSON.stringify(body) + result.stderr.toString());
  expect(existsSync(join(out, 'manifest.json'))).toBe(true);
});
