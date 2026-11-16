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
