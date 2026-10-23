// The scanner keeps an index path only when its spelling is the disk's, so a path that Git lists
// in another letter case cannot reach the index under a name a restricted-path rule misses.
import { expect, test } from 'bun:test';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCache } from '../server/projects/cache';
import { dataLayout } from '../server/projects/paths';
import { createScanner } from '../server/projects/scanner';
import { tempDataDir } from './helpers/temp-data-dir';

test('an index path in another letter case than the disk is not indexed', async () => {
  const data = tempDataDir();
  try {
    const layout = dataLayout(data.root);
    const cache = createCache(layout.cache);
    const dir = join(layout.projects, 'p');
    const text = 'name: T\nontology: [{concept: A}]';
    for (const folder of ['secret', 'SECRET']) {
      mkdirSync(join(dir, folder), { recursive: true });
      writeFileSync(join(dir, folder, 'plan.yaml'), text);
    }
    // A volume that ignores case lists one folder under its disk spelling only.
    let listed = 0;
    const caseInsensitive = (folder: string) => {
      listed++;
      return readdirSync(folder).filter(name => name !== 'SECRET');
    };
    const git = {
      lsFiles: async () => ['secret/plan.yaml', 'SECRET/plan.yaml'],
      status: async () => {
        throw Error('no status');
      },
    };
    const scanner = createScanner(layout, cache, git as never, () => true, caseInsensitive);
    expect((await scanner.scan('p')).changed).toEqual(['secret/plan.yaml']);
    expect(cache.file('p', 'SECRET/plan.yaml')).toBeNull();
    // Each folder is listed once however many files it holds.
    expect(listed).toBe(2);
    cache.close();
  } finally {
    data.cleanup();
  }
});
