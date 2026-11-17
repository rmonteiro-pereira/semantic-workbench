// Injects stops around durable publication and reopens the real data root to reconcile them.
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openWorkspace } from '../src/server/projects/workspace';
import { publicationMoveFixture } from './helpers/publication-fixture';

for (const stage of ['intent', 'ref', 'pointer'] as const) {
  test(`publication stopped after ${stage} recovers at startup`, async () => {
    const { fixture, pointers, worktrees, owner, next } = await publicationMoveFixture(stage);
    try {
      await expect(worktrees.publish('definitions', owner.key, async () => {})).rejects.toThrow('Stopped');
      if (stage === 'intent') expect(pointers.get('definitions')?.commit).toBe(fixture.published!);
      const ws = await openWorkspace({ root: fixture.dir, reconcilePublished: true });
      try {
        const expected = stage === 'intent' ? fixture.published : next;
        expect(ws.state.published().repositories.definitions).toEqual({ branch: 'main', commit: expected! });
        expect(ws.published.pin().commits.get('definitions')?.commit).toBe(expected!);
        expect(await ws.git.head(fixture.repository)).toBe(expected!);
      } finally {
        ws.close();
      }
    } finally {
      fixture.dispose();
    }
  });
}

test('a refused publication never writes a candidate pointer or intent', async () => {
  const { fixture, pointers, worktrees, owner } = await publicationMoveFixture();
  try {
    await expect(
      worktrees.publish('definitions', owner.key, async () => {
        throw Error('Guard refused');
      }),
    ).rejects.toThrow('Guard refused');
    expect(pointers.get('definitions')).toEqual({ branch: 'main', commit: fixture.published! });
  } finally {
    fixture.dispose();
  }
});

test('a published checkout that cannot be repaired still reports the publication that took effect', async () => {
  const { fixture, pointers, worktrees, owner, next } = await publicationMoveFixture();
  try {
    // Git cannot move the published files while another process holds the index.
    writeFileSync(join(fixture.repository, '.git', 'index.lock'), '');
    const result = await worktrees.publish('definitions', owner.key, async () => {});
    expect(result.commit).toBe(next);
    expect(pointers.get('definitions')).toEqual({ branch: 'main', commit: next });
  } finally {
    fixture.dispose();
  }
});

for (const move of ['outside-forward', 'outside-diverged'] as const) {
  test(`publication refuses ${move} before validating from an unserved baseline`, async () => {
    const { fixture, pointers, worktrees, owner, next } = await publicationMoveFixture();
    try {
      const ref = move === 'outside-forward' ? fixture.authoring : fixture.previous!;
      const result = Bun.spawnSync(['git', 'update-ref', 'refs/heads/main', ref], { cwd: fixture.repository, env: process.env });
      expect(result.exitCode).toBe(0);
      let guarded = false;
      await expect(
        worktrees.publish('definitions', owner.key, async () => {
          guarded = true;
        }),
      ).rejects.toThrow('moved outside');
      expect(guarded).toBe(false);
      expect(pointers.get('definitions')).toEqual({ branch: 'main', commit: fixture.published! });
      expect(pointers.get('definitions')?.commit).not.toBe(next);
    } finally {
      fixture.dispose();
    }
  });
}

test('the local HTTP publication creates the first snapshot, preserves dirty authoring and emits published', async () => {
  const { testWorkspace } = await import('./helpers/temp-data-dir');
  const { LOCAL_READER } = await import('../src/server/projects/reader');
  const { ontologyText } = await import('./helpers/git-fixtures');
  using fixture = await testWorkspace();
  const { slug } = await fixture.seed([{ path: 'shop.ontology.yaml', source: ontologyText('Committed', ['Customer']) }], 'Shop');
  const current = fixture.ws.readFile(slug, 'shop.ontology.yaml', LOCAL_READER);
  const dirty = current.source.replace('Committed', 'Saved unpublished edit');
  await fixture.ws.saveFile(slug, 'shop.ontology.yaml', { baseHash: current.hash, source: dirty }, LOCAL_READER);
  const before = fixture.ws.events.lastId;
  expect((await fixture.handler(new Request(`http://localhost/api/agent/catalog?project=${slug}`))).status).toBe(409);
  const response = await fixture.handler(new Request(`http://localhost/api/projects/${slug}/git/publish`, { method: 'POST', body: '{}' }));
  expect(response.status).toBe(200);
  const publication = await response.json();
  expect(publication.previous).toBeNull();
  expect(publication.published).toBe('main');
  expect(fixture.ws.readFile(slug, 'shop.ontology.yaml', LOCAL_READER).source).toBe(dirty);
  const pin = fixture.ws.published.pin();
  expect((await fixture.ws.published.documents(pin, slug))[0].source).toBe(current.source);
  expect(fixture.ws.events.replay(before)?.find(event => event.event === 'published')?.data).toEqual({ project: slug, branch: 'main', commit: publication.commit });
});

for (const stage of ['intent', 'ref', 'pointer'] as const) {
  for (const movement of ['fast-forward', 'diverged'] as const) {
    test(`restart after ${stage} and an outside ${movement} retains the settled snapshot and reports the move`, async () => {
      const { fixture, worktrees, owner, next } = await publicationMoveFixture(stage);
      try {
        await expect(worktrees.publish('definitions', owner.key, async () => {})).rejects.toThrow('Stopped');
        const copy = `${fixture.dir}/worktrees/${owner.key}/definitions`;
        const committed = Bun.spawnSync(['git', 'commit', '--allow-empty', '-qm', 'Outside follow-up'], { cwd: copy, env: process.env });
        expect(committed.exitCode).toBe(0);
        const outside = movement === 'fast-forward' ? Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: copy, env: process.env }).stdout.toString().trim() : fixture.previous!;
        expect(Bun.spawnSync(['git', 'update-ref', 'refs/heads/main', outside], { cwd: fixture.repository, env: process.env }).exitCode).toBe(0);
        const settled = stage === 'pointer' ? next : fixture.published!;
        const ws = await openWorkspace({ root: fixture.dir, reconcilePublished: true });
        try {
          expect(ws.state.published().repositories.definitions).toEqual({ branch: 'main', commit: settled, ...(stage === 'pointer' ? {} : { intent: next }) });
          expect(ws.published.pin().commits.get('definitions')?.commit).toBe(settled);
          expect(await ws.git.head(fixture.repository)).toBe(settled);
          expect(await ws.git.revParse(fixture.repository, 'refs/heads/main')).toBe(outside);
          expect(await ws.published.status('definitions')).toMatchObject({ state: 'pending', move: movement, next: outside, commit: settled });
        } finally {
          ws.close();
        }
      } finally {
        fixture.dispose();
      }
    });
  }
}

test('a publish-route swap failure abandons its intent and cannot publish itself after restart', async () => {
  const { publicationRepository } = await import('./helpers/git-fixtures');
  const { createState } = await import('../src/server/projects/state');
  const { dataLayout } = await import('../src/server/projects/paths');
  const { testWorkspace } = await import('./helpers/temp-data-dir');
  const repository = publicationRepository();
  createState(dataLayout(repository.dir)).writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
  using fixture = await testWorkspace({ root: repository.dir });
  await fixture.ws.git.run(repository.repository, ['switch', 'work/local']);
  const original = fixture.ws.git.run;
  fixture.ws.git.run = (directory, args, options) => {
    if (args[0] === 'update-ref') return Promise.resolve({ code: 1, stdout: '', stderr: 'Ref locked by an outside writer.', bytes: new Uint8Array() });
    return original(directory, args, options);
  };
  const response = await fixture.handler(new Request('http://localhost/api/projects/definitions/git/publish', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(409);
  expect(fixture.ws.state.published().repositories.definitions).toEqual({ branch: 'main', commit: repository.published! });
  fixture.ws.git.run = original;
  await original(repository.repository, ['update-ref', 'refs/heads/main', repository.authoring]);
  fixture.ws.close();
  const restarted = await openWorkspace({ root: repository.dir });
  try {
    expect(restarted.state.published().repositories.definitions).toEqual({ branch: 'main', commit: repository.published! });
    expect(await restarted.published.status('definitions')).toMatchObject({ state: 'pending', next: repository.authoring });
  } finally {
    restarted.close();
  }
});

test('the first agent read after Publish reuses the validated index and releases it on refusal', async () => {
  const { testWorkspace } = await import('./helpers/temp-data-dir');
  const { ontologyText } = await import('./helpers/git-fixtures');
  const { LOCAL_READER } = await import('../src/server/projects/reader');
  using fixture = await testWorkspace();
  const { slug } = await fixture.seed([{ path: 'shop.ontology.yaml', source: ontologyText('Committed', ['Customer']) }], 'Shop');
  const original = fixture.ws.git.catFileBatch;
  let builds = 0;
  fixture.ws.git.catFileBatch = (...args) => {
    builds++;
    return original(...args);
  };
  await fixture.ws.publish(slug, LOCAL_READER);
  expect(builds).toBe(1);
  const response = await fixture.handler(new Request(`http://localhost/api/agent/catalog?project=${slug}`));
  expect(response.status).toBe(200);
  expect(builds).toBe(1);
  expect(fixture.ws.published.retainedCount()).toBe(1);
  await fixture.ws.git.commit(`${fixture.root}/projects/${slug}`, 'Next candidate', true);
  const run = fixture.ws.git.run;
  fixture.ws.git.run = (directory, args, options) => {
    if (args[0] === 'update-ref') return Promise.resolve({ code: 1, stdout: '', stderr: 'Ref locked.', bytes: new Uint8Array() });
    return run(directory, args, options);
  };
  const refused = await fixture.handler(new Request(`http://localhost/api/projects/${slug}/git/publish`, { method: 'POST', body: '{}' }));
  expect(refused.status).toBe(409);
  expect(builds).toBe(2);
  expect(fixture.ws.published.retainedCount()).toBe(1);
});
