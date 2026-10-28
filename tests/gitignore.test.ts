// Tests Git ignore rules and workspace visibility.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendIgnore, escapeIgnore, ignoreChoices } from '../src/shared/scm/gitignore';
import { call, ok, scmProject, sh } from './helpers/scm';
import { LOCAL_READER } from '../src/server/projects/reader';
test('Add to .gitignore offers the exact path, the extension and the folder, escaped for Git', () => {
  expect(ignoreChoices('notes.csv')).toEqual([
    { pattern: '/notes.csv', label: 'This file (notes.csv)' },
    { pattern: '*.csv', label: 'All .csv files' },
  ]);
  expect(ignoreChoices('data/raw/dump [1].tar.gz').map(c => c.pattern)).toEqual([
    '/data/raw/dump \\[1].tar.gz',
    '*.gz',
    '/data/raw/',
  ]);
  expect(ignoreChoices('.env').map(c => c.pattern)).toEqual(['/.env']);
  expect(ignoreChoices('Makefile').map(c => c.pattern)).toEqual(['/Makefile']);
  expect(escapeIgnore('#x')).toBe('\\#x');
  expect(escapeIgnore('!x')).toBe('\\!x');
  expect(escapeIgnore('a*b?')).toBe('a\\*b\\?');
  expect(escapeIgnore('end ')).toBe('end\\ ');
  expect(appendIgnore('', '*.log')).toBe('*.log\n');
  expect(appendIgnore('a', '*.log')).toBe('a\n*.log\n');
  expect(appendIgnore('a\r\n', 'b')).toBe('a\r\nb\r\n');
  expect(appendIgnore('*.log\n', '*.log')).toBeNull();
  expect(() => appendIgnore('', 'a\nb')).toThrow();
  expect(() => appendIgnore('', ' ')).toThrow();
});
test('appending through the API is a hash-checked save that rescans: the file leaves Source Control and the workspace', async () => {
  const p = await scmProject({ remote: false });
  try {
    p.write('notes.csv', 'a,b\n');
    p.write('extra.yaml', 'name: Extra\nontology:\n  - concept: X\n    type: EntityType\n');
    const before = await ok(call(p.t, 'GET', p.base + '/git/status'));
    expect(before.changes.map((c: any) => c.path).sort()).toEqual(['extra.yaml', 'notes.csv']);
    const r = await ok(call(p.t, 'POST', p.base + '/gitignore', { pattern: '*.csv' }));
    expect(r).toMatchObject({ added: true, tracked: [] });
    expect(readFileSync(join(p.dir, '.gitignore'), 'utf8')).toBe('*.csv\n');
    const after = await ok(call(p.t, 'GET', p.base + '/git/status'));
    expect(after.changes.map((c: any) => c.path).sort()).toEqual(['.gitignore', 'extra.yaml']);
    await ok(call(p.t, 'POST', p.base + '/gitignore', { pattern: '/extra.yaml' }));
    const files = (await ok(call(p.t, 'GET', '/api/projects')))[0].files.map((f: any) => f.path);
    expect(files).toContain('.gitignore');
    expect(files).not.toContain('extra.yaml');
    expect((await ok(call(p.t, 'POST', p.base + '/gitignore', { pattern: '*.csv' }))).added).toBe(
      false,
    );
    // .gitignore is edited like any other file, with the base hash.
    const g = p.t.ws.readFile(p.slug, '.gitignore');
    expect(g.docType).toBe('gitignore');
    await p.t.ws.saveFile(
      p.slug,
      '.gitignore',
      { baseHash: g.hash, source: '*.csv\n' },
      LOCAL_READER,
    );
    expect(
      (await ok(call(p.t, 'GET', '/api/projects')))[0].files.map((f: any) => f.path),
    ).toContain('extra.yaml');
    expect((await call(p.t, 'POST', p.base + '/gitignore', { pattern: 'a\nb' })).status).toBe(400);
  } finally {
    p.dispose();
  }
});
test('ignoring a tracked file explains that Git keeps tracking it', async () => {
  const p = await scmProject({ remote: false });
  try {
    const r = await ok(call(p.t, 'POST', p.base + '/gitignore', { pattern: '/shop.yaml' }));
    expect(r.tracked).toEqual(['shop.yaml']);
    expect(sh(p.dir, ['ls-files'])).toContain('shop.yaml');
  } finally {
    p.dispose();
  }
});
