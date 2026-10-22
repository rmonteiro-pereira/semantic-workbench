import { expect, test } from 'bun:test';
import {
  checkReleaseVersion,
  compareReleases,
  parseRelease,
  releaseTag,
  versionQuery,
} from '../../scripts/deploy-version';

test('a tag must match the package core and never go below any promoted tag', () => {
  expect(() => checkReleaseVersion('v0.4.0-alpha.1', '0.4.0', ['sha-abc', 'v0.3.0'])).not.toThrow();
  expect(() => checkReleaseVersion('v0.4.0', undefined, [])).toThrow('declare a release version');
  expect(() => checkReleaseVersion('v0.4.0', '0.3.0', [])).toThrow('does not match');
  expect(() => checkReleaseVersion('v0.4.0-alpha.1', '0.4.0', ['v0.4.0'])).toThrow('older');
  expect(() => checkReleaseVersion('v0.4.0', '0.4.0', ['v0.5.0', 'v0.3.0'])).toThrow('older');
  expect(() => checkReleaseVersion('v0.4.0', '0.4.0', ['v0.4.0'])).not.toThrow();
});

test('release precedence compares numeric prereleases and stable versions correctly', () => {
  const ordered = ['v0.4.0-alpha.2', 'v0.4.0-alpha.10', 'v0.4.0-beta', 'v0.4.0', 'v0.10.0'];
  for (let index = 1; index < ordered.length; index++) {
    expect(compareReleases(ordered[index - 1], ordered[index])).toBeLessThan(0);
  }
  for (const tag of ['v01.4.0', 'v0.4.0-alpha.01', 'v0.4.0-a..b', 'v0.4.0-a_b']) {
    expect(() => parseRelease(tag)).toThrow();
  }
  expect(versionQuery('swexample')).toEqual([
    'az',
    'acr',
    'repository',
    'show-tags',
    '--name',
    'swexample',
    '--repository',
    'semantic-workbench',
    '--output',
    'json',
  ]);
});

test('pipeline refs and local overrides are validated before use', () => {
  expect(releaseTag(undefined, 'refs/tags/v0.4.0-alpha.1')).toBe('v0.4.0-alpha.1');
  expect(releaseTag('v0.5.0', 'refs/tags/v0.4.0')).toBe('v0.5.0');
  for (const tag of ['v0.4.0;id', 'v0.4.0|id', 'v0.4.0-$(id)', 'v0.4.0-`id`']) {
    expect(() => releaseTag(undefined, `refs/tags/${tag}`)).toThrow('Invalid release');
  }
  expect(() => releaseTag(undefined, 'refs/heads/v0.4.0')).toThrow();
  expect(() => releaseTag(undefined, undefined)).toThrow();
});
