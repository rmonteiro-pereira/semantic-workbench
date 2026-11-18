import { expect, spyOn, test } from 'bun:test';
import { switchItemBranch } from '../../src/app/item-diff/BranchControl';
import { fetchItemDiff } from '../../src/app/projects/api';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';
import { publishFixture } from '../helpers/published-workspace';

test('the item branch journey only switches and rereads saved work', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  await publishFixture(fixture);
  const requests: string[] = [];
  const fetch = spyOn(globalThis, 'fetch');
  const forwarded: (...args: Parameters<typeof globalThis.fetch>) => Promise<Response> = (input, options) => {
    const url = new URL(String(input), 'http://localhost:5173');
    requests.push(url.pathname);
    const headers = new Headers(options?.headers);
    headers.set('Origin', 'http://localhost:5173');
    headers.set('Sec-Fetch-Site', 'same-origin');
    return fixture.handler(new Request(url, { ...options, headers }));
  };
  fetch.mockImplementation(Object.assign(forwarded, { preconnect: globalThis.fetch.preconnect }));
  try {
    const project = 'finance';
    const original = fixture.ws.state.published().repositories[project].branch;
    const before = await fetchItemDiff(project, 'published', 'working');
    await expect(switchItemBranch(project, 'bad..name', true)).rejects.toThrow('not a valid branch name');
    await expect(switchItemBranch(project, original, true)).rejects.toThrow('already exists');
    expect(await switchItemBranch(project, 'item/customer', true)).toMatchObject({ branch: 'item/customer' });
    expect(await switchItemBranch(project, original, false)).toMatchObject({ branch: original });
    const after = await fetchItemDiff(project, 'published', 'working');
    expect(after).toEqual(before);
    expect(requests).toEqual([
      '/api/projects/finance/item-diff',
      '/api/projects/finance/git/switch',
      '/api/projects/finance/git/switch',
      '/api/projects/finance/git/switch',
      '/api/projects/finance/git/switch',
      '/api/projects/finance/item-diff',
    ]);
  } finally {
    fetch.mockRestore();
  }
});
