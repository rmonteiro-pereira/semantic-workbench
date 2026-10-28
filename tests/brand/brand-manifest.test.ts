// Tests the rules for brand.json: required names, their lengths and the support link scheme.
import { expect, test } from 'bun:test';
import { parseBrandManifest } from '../../src/shared/brand/manifest';

const valid = { productName: 'Acme Models', shortName: 'Acme' };

function parse(value: unknown) {
  return parseBrandManifest(JSON.stringify(value));
}

test('a valid manifest keeps its names and drops unknown keys', () => {
  expect(parse({ ...valid, extra: 1 })).toEqual(valid);
  expect(parse({ ...valid, supportUrl: 'https://help.example.org/x' }).supportUrl).toBe(
    'https://help.example.org/x',
  );
});

test('names are required and bounded', () => {
  expect(() => parse({ shortName: 'A' })).toThrow('productName');
  expect(() => parse({ ...valid, productName: '   ' })).toThrow('1 to 60');
  expect(() => parse({ ...valid, productName: 'x'.repeat(61) })).toThrow('1 to 60');
  expect(() => parse({ ...valid, productName: 'x'.repeat(60) })).not.toThrow();
  expect(() => parse({ ...valid, shortName: 'x'.repeat(25) })).toThrow('1 to 24');
  expect(() => parse({ ...valid, shortName: 'x'.repeat(24) })).not.toThrow();
  expect(() => parse({ ...valid, productName: 'two\nlines' })).toThrow('control');
  expect(() => parse({ ...valid, productName: 7 })).toThrow('must be text');
});

test('the support link must be http or https', () => {
  expect(() => parse({ ...valid, supportUrl: 'javascript:alert(1)' })).toThrow('http or https');
  expect(() => parse({ ...valid, supportUrl: 'ftp://example.org' })).toThrow('http or https');
  expect(() => parse({ ...valid, supportUrl: 'not a url' })).toThrow('http or https');
  expect(() => parse({ ...valid, supportUrl: 'http://example.org' })).not.toThrow();
});

test('text that is not a JSON object is refused', () => {
  expect(() => parseBrandManifest('{nope')).toThrow('not valid JSON');
  expect(() => parseBrandManifest('[]')).toThrow('JSON object');
  expect(() => parseBrandManifest('null')).toThrow('JSON object');
});
