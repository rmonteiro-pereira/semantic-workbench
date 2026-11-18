// A virtual path is either exactly the project and file the agent named, or a refusal, whatever hostile text arrives.
import { expect, test } from 'bun:test';
import { MAXIMUM_VIRTUAL_PATH_BYTES, VIRTUAL_ROOT, formatVirtualPath, parseVirtualPath } from '../../src/server/acp/virtual-path';

test('a plain path parses into its project and file', () => {
  expect(parseVirtualPath('/workbench/sales/a/b.yaml')).toEqual({ ok: true, project: 'sales', path: 'a/b.yaml' });
  expect(parseVirtualPath('/workbench/sales/número.yaml')).toEqual({ ok: true, project: 'sales', path: 'número.yaml' });
});

test('formatting and parsing agree', () => {
  expect(parseVirtualPath(formatVirtualPath('sales', 'a/b.yaml'))).toEqual({ ok: true, project: 'sales', path: 'a/b.yaml' });
});

const refused: [string, unknown][] = [
  ['no root', 'sales/a.yaml'],
  ['another root', '/other/sales/a.yaml'],
  ['root only', VIRTUAL_ROOT],
  ['root with slash', VIRTUAL_ROOT + '/'],
  ['project only', VIRTUAL_ROOT + '/sales'],
  ['project with slash only', VIRTUAL_ROOT + '/sales/'],
  ['not text', 42],
  ['null', null],
  ['trailing slash', VIRTUAL_ROOT + '/sales/a/'],
  ['uppercase project', VIRTUAL_ROOT + '/Sales/a.yaml'],
  ['git folder', VIRTUAL_ROOT + '/sales/.git/config'],
];
for (const [name, value] of refused) {
  test(`refuses ${name}`, () => {
    expect(parseVirtualPath(value).ok).toBe(false);
  });
}

function hasControlCharacter(text: string): boolean {
  return [...text].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

const separators = ['..', '.', '', '...'];
const hostileFragments = ['..', '.', '', '%2f', '%2F', '%5c', '%5C', '%2e%2e', '\\', 'C:', 'c:\\x', '\0', '\n', '\t', '\x7f', '//', 'a\\b', '日本語', '😀', ' ', 'a b'.repeat(400)];

function generatedPaths(): string[] {
  const paths: string[] = [];
  for (const first of hostileFragments) {
    for (const second of hostileFragments) {
      for (const base of ['/workbench/sales/', '/workbench/', '/workbench//', '/workbench/sales/x/']) {
        paths.push(base + first + '/' + second);
        paths.push(base + first + second);
      }
    }
  }
  for (const separator of separators) paths.push(`/workbench/sales/${separator}/a.yaml`, `/workbench/sales/a/${separator}/b.yaml`, `/workbench/${separator}/a.yaml`);
  return paths;
}

test('at least five hundred hostile inputs are either refused or parse to a safe project and path', () => {
  const inputs = generatedPaths();
  expect(inputs.length).toBeGreaterThanOrEqual(500);
  for (const input of inputs) {
    const result = parseVirtualPath(input);
    if (!result.ok) continue;
    const segments = result.path.split('/');
    expect(
      segments.every(segment => segment !== '' && segment !== '.' && segment !== '..'),
      input,
    ).toBe(true);
    expect(result.project, input).toMatch(/^[a-z0-9][a-z0-9-]{0,62}$/);
    expect(result.path.includes('\\') || hasControlCharacter(result.path) || /%(2f|5c|2e)/i.test(result.path), input).toBe(false);
    expect(formatVirtualPath(result.project, result.path), input).toBe(input);
  }
});

test('a path of exactly the byte limit is accepted when otherwise valid and one byte more is refused', () => {
  const prefix = '/workbench/sales/';
  const exact = prefix + 'a'.repeat(MAXIMUM_VIRTUAL_PATH_BYTES - prefix.length);
  expect(parseVirtualPath(exact).ok).toBe(true);
  expect(parseVirtualPath(exact + 'a')).toEqual({ ok: false, reason: 'length' });
});

test('multibyte names count bytes, not characters', () => {
  const name = '😀'.repeat(300);
  expect(parseVirtualPath('/workbench/sales/' + name)).toEqual({ ok: false, reason: 'length' });
});
