import { expect, test } from 'bun:test';

test('the comparison documentation points to executable checks and existing guides', async () => {
  const manifest = await Bun.file('package.json').json();
  const development = await Bun.file('docs/development.md').text();
  expect(development).toContain('test:item-diff');
  const script = manifest.scripts['test:item-diff'];
  expect(script).toMatch(/^bun scripts\//);
  expect(await Bun.file(script.slice(4)).exists()).toBe(true);
  for (const path of ['item-diff', 'item-addresses', 'graph-design', 'user-guide']) {
    expect(await Bun.file(`docs/${path}.md`).exists()).toBe(true);
  }
  expect(await Bun.file('README.md').text()).toContain('(docs/item-diff.md)');
});
