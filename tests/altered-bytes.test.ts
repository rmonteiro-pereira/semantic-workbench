// Tests reporting file bytes changed by Git hooks and filters.
import { test, expect } from 'bun:test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, ok, ontology, scmProject, sh } from './helpers/scm';

test('a pre-commit hook that rewrites a staged file is reported after the commit', async () => {
  const project = await scmProject({ remote: false });
  try {
    const hook = join(project.dir, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nprintf "# stamped\\n" >> shop.yaml\n');
    chmodSync(hook, 0o755);
    project.write('shop.yaml', ontology('Hooked.'));
    await ok(call(project.t, 'POST', project.base + '/git/stage', { all: true }));
    const commitResult = await ok(call(project.t, 'POST', project.base + '/git/commit', { message: 'With hook' }));
    expect(commitResult.altered).toEqual(['shop.yaml']);
    expect(readFileSync(join(project.dir, 'shop.yaml'), 'utf8').endsWith('# stamped\n')).toBe(true);
  } finally {
    project.dispose();
  }
});
test('a clean filter from .gitattributes: committed bytes differ from the saved file and are reported', async () => {
  const project = await scmProject({ remote: false });
  try {
    sh(project.dir, ['config', 'filter.upper.clean', 'tr a-z A-Z']);
    sh(project.dir, ['config', 'filter.upper.smudge', 'cat']);
    project.write('.gitattributes', '*.txt filter=upper\n');
    project.write('readme.txt', 'hello\n');
    await ok(call(project.t, 'POST', project.base + '/git/stage', { all: true }));
    const commitResult = await ok(call(project.t, 'POST', project.base + '/git/commit', { message: 'Filtered' }));
    expect(commitResult.altered).toEqual(['readme.txt']);
    expect(sh(project.dir, ['show', 'HEAD:readme.txt'])).toBe('HELLO\n');
    // A plain commit without filters reports nothing.
    project.write('shop.yaml', ontology('Plain.'));
    await ok(call(project.t, 'POST', project.base + '/git/stage', { paths: ['shop.yaml'] }));
    expect((await ok(call(project.t, 'POST', project.base + '/git/commit', { message: 'Plain' }))).altered).toEqual([]);
  } finally {
    project.dispose();
  }
});
test('a smudge filter that rewrites pulled content is reported after the pull', async () => {
  const project = await scmProject();
  try {
    sh(project.dir, ['config', 'filter.stamp.smudge', 'sed s/^/~/']);
    sh(project.dir, ['config', 'filter.stamp.clean', 'sed s/^~//']);
    writeFileSync(join(project.other, '.gitattributes'), '*.txt filter=stamp\n');
    writeFileSync(join(project.other, 'readme.txt'), 'line\n');
    sh(project.other, ['add', '.']);
    sh(project.other, ['commit', '-qm', 'Attributes']);
    sh(project.other, ['push', '-q']);
    const pullResult = await ok(call(project.t, 'POST', project.base + '/git/pull'));
    expect(pullResult.ok).toBe(true);
    expect(pullResult.altered).toEqual(['readme.txt']);
    expect(readFileSync(join(project.dir, 'readme.txt'), 'utf8')).toBe('~line\n');
  } finally {
    project.dispose();
  }
});
