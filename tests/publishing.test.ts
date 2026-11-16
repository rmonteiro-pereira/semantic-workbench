// Injects stops around durable publication and reopens the real data root to reconcile them.
import { expect, test } from 'bun:test';
import { createWorktrees } from '../src/server/projects/worktrees';
import { openWorkspace } from '../src/server/projects/workspace';
import { publicationMoveFixture } from './helpers/publication-fixture';

for (const stage of ['intent', 'ref', 'pointer'] as const) {
  test(`publication stopped after ${stage} recovers at startup`, async () => {
    const { fixture, pointers, worktrees, owner, next } = await publicationMoveFixture(createWorktrees, stage);
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
  const { fixture, pointers, worktrees, owner } = await publicationMoveFixture(createWorktrees);
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

for (const move of ['outside-forward', 'outside-diverged'] as const) {
  test(`publication refuses ${move} before validating from an unserved baseline`, async () => {
    const { fixture, pointers, worktrees, owner, next } = await publicationMoveFixture(createWorktrees);
    try {
      const ref = move === 'outside-forward' ? fixture.authoring : fixture.previous!;
      const result = Bun.spawnSync(['git', 'update-ref', 'refs/heads/main', ref], { cwd: fixture.repository });
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
