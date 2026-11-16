// Proves each publication refusal and the ordered extension seam independently.
import { expect, test } from 'bun:test';
import { publicationChecks } from '../src/server/projects/publication-checks';
const candidate = { repo: 'definitions', branch: 'main', previous: 'a'.repeat(40), next: 'b'.repeat(40) };

for (const refused of ['fast-forward', 'bounds', 'guard', null]) {
  test(`publication checks stop at ${refused ?? 'the appended check'}`, async () => {
    const calls: string[] = [];
    const checks = publicationChecks({
      isAncestor: async () => {
        calls.push('fast-forward');
        return refused !== 'fast-forward';
      },
      readable: async () => {
        calls.push('bounds');
        if (refused === 'bounds') throw Error('Missing blob');
      },
      guard: async () => {
        calls.push('guard');
        if (refused === 'guard') throw Error('Guard refused');
      },
    });
    checks.push(async () => {
      calls.push('appended');
    });
    const publish = async () => {
      for (const check of checks) await check(candidate);
    };
    if (refused) await expect(publish()).rejects.toThrow();
    else await publish();
    const expected = ['fast-forward', 'bounds', 'guard', 'appended'];
    expect(calls).toEqual(refused ? expected.slice(0, expected.indexOf(refused) + 1) : expected);
  });
}
test('first publication still runs bounded reads and content guards', async () => {
  const calls: string[] = [];
  const checks = publicationChecks({
    isAncestor: async () => {
      throw Error('No prior commit');
    },
    readable: async () => {
      calls.push('bounds');
    },
    guard: async () => {
      calls.push('guard');
    },
  });
  for (const check of checks) await check({ ...candidate, previous: null });
  expect(calls).toEqual(['bounds', 'guard']);
});
