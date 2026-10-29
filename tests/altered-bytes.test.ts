// Tests reporting file bytes changed by Git hooks and filters.
import { test, expect } from 'bun:test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, ok, ontology, scmProject, sh } from './helpers/scm';

test('a pre-commit hook that rewrites a staged file is reported after the commit', async () => {
  const p = await scmProject({ remote: false });
  try {
    const hook = join(p.dir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nprintf "# stamped\\n" >> shop.yaml\n');
    chmodSync(hook, 0o755);
    p.write('shop.yaml', ontology('Hooked.'));
    await ok(call(p.t, 'POST', p.base + '/git/stage', { all: true }));
    const r = await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'With hook' }));
    expect(r.altered).toEqual(['shop.yaml']);
    expect(readFileSync(join(p.dir, 'shop.yaml'), 'utf8').endsWith('# stamped\n')).toBe(true);
  } finally {
    p.dispose();
  }
});
test('a clean filter from .gitattributes: committed bytes differ from the saved file and are reported', async () => {
  const p = await scmProject({ remote: false });
  try {
    sh(p.dir, ['config', 'filter.upper.clean', 'tr a-z A-Z']);
    sh(p.dir, ['config', 'filter.upper.smudge', 'cat']);
    p.write('.gitattributes', '*.txt filter=upper\n');
    p.write('readme.txt', 'hello\n');
    await ok(call(p.t, 'POST', p.base + '/git/stage', { all: true }));
    const r = await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'Filtered' }));
    expect(r.altered).toEqual(['readme.txt']);
    expect(sh(p.dir, ['show', 'HEAD:readme.txt'])).toBe('HELLO\n');
    // A plain commit without filters reports nothing.
    p.write('shop.yaml', ontology('Plain.'));
    await ok(call(p.t, 'POST', p.base + '/git/stage', { paths: ['shop.yaml'] }));
    expect((await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'Plain' }))).altered).toEqual([]);
  } finally {
    p.dispose();
  }
});
test('a smudge filter that rewrites pulled content is reported after the pull', async () => {
  const p = await scmProject();
  try {
    sh(p.dir, ['config', 'filter.stamp.smudge', 'sed s/^/~/']);
    sh(p.dir, ['config', 'filter.stamp.clean', 'sed s/^~//']);
    writeFileSync(join(p.other, '.gitattributes'), '*.txt filter=stamp\n');
    writeFileSync(join(p.other, 'readme.txt'), 'line\n');
    sh(p.other, ['add', '.']);
    sh(p.other, ['commit', '-qm', 'Attributes']);
    sh(p.other, ['push', '-q']);
    const r = await ok(call(p.t, 'POST', p.base + '/git/pull'));
    expect(r.ok).toBe(true);
    expect(r.altered).toEqual(['readme.txt']);
    expect(readFileSync(join(p.dir, 'readme.txt'), 'utf8')).toBe('~line\n');
  } finally {
    p.dispose();
  }
});
