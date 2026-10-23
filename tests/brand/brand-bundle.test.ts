// Tests loading a brand folder over the shipped defaults: fallback, validation, the size caps,
// unknown names and files that point outside the folder.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBrandBundle } from '../../server/brand/bundle';
import { BRAND_FILE_NAMES, MAX_IMAGE_BYTES, MAX_TEXT_BYTES } from '../../server/brand/files';

const GOOD_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" fill="#abcdef"/></svg>';
const GOOD_JSON = JSON.stringify({ productName: 'Acme Models', shortName: 'Acme' });

let folder: string;
let warnings: string[];

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'workbench-brand-'));
  warnings = [];
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function load() {
  return loadBrandBundle({ directory: folder, warn: message => warnings.push(message) });
}

function put(name: string, content: string) {
  writeFileSync(join(folder, name), content);
}

test('without a folder the shipped defaults are served', () => {
  const bundle = loadBrandBundle({ warn: message => warnings.push(message) });
  expect(bundle.manifest.productName).toBe('Semantic Workbench');
  expect([...bundle.files.keys()].sort()).toEqual([...BRAND_FILE_NAMES].sort());
  expect(warnings).toEqual([]);
});

test('an empty folder falls back to every default', () => {
  expect(load().manifest.productName).toBe('Semantic Workbench');
  expect(warnings).toEqual([]);
});

test('a subset of files replaces only those files', () => {
  put('logo.svg', GOOD_SVG);
  put('brand.json', GOOD_JSON);
  const bundle = load();
  expect(bundle.manifest.productName).toBe('Acme Models');
  expect(bundle.files.get('logo.svg')!.body).toContain('#abcdef');
  expect(bundle.files.get('favicon.svg')!.body).not.toContain('#abcdef');
});

test('an invalid file keeps the default and names the file in a warning', () => {
  put('brand.json', '{"productName": ""}');
  put('logo.svg', '<html>not an svg</html>');
  const bundle = load();
  expect(bundle.manifest.productName).toBe('Semantic Workbench');
  expect(bundle.files.get('logo.svg')!.body).toContain('Semantic Workbench');
  expect(warnings.some(line => line.startsWith('brand.json:'))).toBe(true);
  expect(warnings.some(line => line.startsWith('logo.svg:'))).toBe(true);
});

test('files over the size cap are refused', () => {
  put('logo.svg', GOOD_SVG.replace('</svg>', `<!--${'x'.repeat(MAX_IMAGE_BYTES)}--></svg>`));
  put('brand.json', GOOD_JSON + ' '.repeat(MAX_TEXT_BYTES));
  put('brand.css', ':root{--color-accent:red}' + ' '.repeat(MAX_TEXT_BYTES));
  const bundle = load();
  expect(bundle.manifest.productName).toBe('Semantic Workbench');
  expect(bundle.files.get('brand.css')!.body).toBe('');
  expect(warnings.filter(line => line.includes('larger than'))).toHaveLength(3);
});

test('a file exactly at the cap is accepted', () => {
  const padding = MAX_TEXT_BYTES - GOOD_JSON.length;
  put('brand.json', GOOD_JSON + ' '.repeat(padding));
  expect(load().manifest.productName).toBe('Acme Models');
});

test('unknown file names are ignored and never served', () => {
  put('secret.txt', 'private');
  put('logo.png', 'x');
  const bundle = load();
  expect([...bundle.files.keys()]).not.toContain('secret.txt' as never);
  expect(warnings.filter(line => line.includes('not a brand file'))).toHaveLength(2);
});

test('script and unsafe css are cleaned while loading', () => {
  put('logo.svg', GOOD_SVG.replace('<circle', '<script>alert(1)</script><circle'));
  put('brand.css', 'body{background:url(https://evil.example)} :root{--color-accent:#102030}');
  const bundle = load();
  expect(bundle.files.get('logo.svg')!.body).not.toContain('script');
  expect(bundle.files.get('brand.css')!.body).toBe(':root {\n  --color-accent: #102030;\n}\n');
  expect(warnings.some(line => line.startsWith('brand.css:'))).toBe(true);
});

test('a symlink that leaves the folder is refused, one inside is followed', () => {
  const outside = mkdtempSync(join(tmpdir(), 'workbench-outside-'));
  try {
    writeFileSync(join(outside, 'logo.svg'), GOOD_SVG);
    symlinkSync(join(outside, 'logo.svg'), join(folder, 'logo.svg'));
    mkdirSync(join(folder, '..data'));
    writeFileSync(join(folder, '..data', 'favicon.svg'), GOOD_SVG);
    symlinkSync(join('..data', 'favicon.svg'), join(folder, 'favicon.svg'));
    const bundle = load();
    expect(bundle.files.get('logo.svg')!.body).not.toContain('#abcdef');
    expect(warnings.some(line => line.includes('outside the brand folder'))).toBe(true);
    expect(bundle.files.get('favicon.svg')!.body).toContain('#abcdef');
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('a dangling symlink and a directory named like a file are refused quietly', () => {
  symlinkSync(join(folder, 'missing.svg'), join(folder, 'logo.svg'));
  mkdirSync(join(folder, 'brand.css'));
  const bundle = load();
  expect(bundle.manifest.productName).toBe('Semantic Workbench');
  expect(warnings.filter(line => line.includes('The default is used instead'))).toHaveLength(2);
});
