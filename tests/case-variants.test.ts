// Refuses names that differ from an existing one only in letter case, as a volume that ignores
// case (Azure Files over SMB) would otherwise open them as the same file.
import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertExactCase,
  CaseVariantError,
  dataLayout,
  projectFile,
  type DirectoryLister,
} from '../src/server/projects/paths';

// A listing as the on-disk names of a small tree: `secret/plan.yaml` and `Notes.yaml`.
const tree: Record<string, string[]> = {
  '/p': ['secret', 'Notes.yaml'],
  '/p/secret': ['plan.yaml'],
};
const listTree: DirectoryLister = directory => {
  const names = tree[directory];
  if (!names) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  return names;
};

test('an existing path in its exact case is accepted', () => {
  expect(() => assertExactCase('/p', 'secret/plan.yaml', listTree)).not.toThrow();
  expect(() => assertExactCase('/p', 'Notes.yaml', listTree)).not.toThrow();
});

test('a case variant of an existing folder or file is refused', () => {
  for (const path of ['SECRET/plan.yaml', 'secret/PLAN.yaml', 'notes.yaml', 'Secret/x.yaml']) {
    expect(() => assertExactCase('/p', path, listTree)).toThrow(CaseVariantError);
  }
});

test('a new name that is not a case variant is accepted at any depth', () => {
  expect(() => assertExactCase('/p', 'secret/other.yaml', listTree)).not.toThrow();
  expect(() => assertExactCase('/p', 'fresh/deep/er.yaml', listTree)).not.toThrow();
});

test('a listing failure other than a missing folder is not swallowed', () => {
  const broken: DirectoryLister = () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  };
  expect(() => assertExactCase('/p', 'a.yaml', broken)).toThrow('denied');
});

test('on the real case-sensitive disk a sibling that differs in case is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'case-variants-'));
  try {
    const layout = dataLayout(root);
    mkdirSync(join(layout.projects, 'demo', 'secret'), { recursive: true });
    writeFileSync(join(layout.projects, 'demo', 'secret', 'plan.yaml'), 'x');
    expect(projectFile(layout, 'demo', 'secret/plan.yaml')).toContain('secret/plan.yaml');
    expect(projectFile(layout, 'demo', 'secret/new.yaml')).toContain('secret/new.yaml');
    expect(() => projectFile(layout, 'demo', 'SECRET/plan.yaml')).toThrow(CaseVariantError);
    expect(() => projectFile(layout, 'demo', 'SECRET/new.yaml')).toThrow(CaseVariantError);
    expect(() => projectFile(layout, 'demo', 'secret/Plan.yaml')).toThrow(CaseVariantError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
