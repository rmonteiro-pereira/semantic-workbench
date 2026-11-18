// Checks the registrations document: schema and typed checks, the round trip through the administration repository and repositories made before the document existed.
import { expect, test } from 'bun:test';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openAdminRepository, AdminConfigError } from '../../src/server/auth/admin-repo';
import { AccessConfigError, validateAccessDocument } from '../../src/server/auth/access-config';
import { tempDataDir } from '../helpers/temp-data-dir';

const author = { name: 'Admin Person', email: 'admin@example.org' };
const program = {
  clientId: 'reference-client',
  name: 'Protocol reference client',
  description: 'Used in acceptance runs.',
  redirectUris: ['http://127.0.0.1:8765/callback'],
  scopes: ['read', 'validate', 'edit', 'commit'],
  setupNote: '',
};
const document = (change: Record<string, unknown> = {}) => ({ formatVersion: 1, programs: [{ ...program, ...change }] });

test('a valid document passes and each invalid field fails', () => {
  expect(() => validateAccessDocument('programsFile', document())).not.toThrow();
  const invalid: Record<string, unknown>[] = [
    { clientId: 'x' },
    { name: '' },
    { redirectUris: [] },
    { redirectUris: ['a', 'a'] },
    { scopes: ['administration'] },
    { scopes: ['read', 'read'] },
    { unknown: true },
    { setupNote: 'x'.repeat(1001) },
  ];
  for (const change of invalid) expect(() => validateAccessDocument('programsFile', document(change)), JSON.stringify(change)).toThrow(AccessConfigError);
  expect(() => validateAccessDocument('programsFile', { formatVersion: 1 })).toThrow(AccessConfigError);
});

async function repositoryWithFiles(root: string) {
  const repository = openAdminRepository({ root });
  await repository.ensure();
  return repository;
}

test('a new repository holds an empty programs document in its first commit', async () => {
  const directory = tempDataDir();
  try {
    const repository = await repositoryWithFiles(directory.root);
    expect(repository.load().programs).toEqual({ formatVersion: 1, programs: [] });
    expect(readdirSync(join(directory.root, 'admin'))).toContain('programs.json');
    expect(await repository.history()).toHaveLength(1);
  } finally {
    directory.cleanup();
  }
});

test('a saved registration round trips in exactly one commit', async () => {
  const directory = tempDataDir();
  try {
    const repository = await repositoryWithFiles(directory.root);
    const before = await repository.version();
    await repository.write({ 'programs.json': JSON.stringify(document()) }, { author, baseVersion: before, message: 'programs: Add agent program' });
    expect(repository.load().programs.programs[0].clientId).toBe('reference-client');
    expect(await repository.history('programs.json')).toHaveLength(2);
    expect(await repository.history()).toHaveLength(2);
  } finally {
    directory.cleanup();
  }
});

test('a registration that fails a typed check is refused and changes nothing', async () => {
  const directory = tempDataDir();
  try {
    const repository = await repositoryWithFiles(directory.root);
    const before = await repository.version();
    const refused = repository.write(
      { 'programs.json': JSON.stringify(document({ redirectUris: ['http://example.com/cb'] })) },
      { author, baseVersion: before, message: 'programs: Add agent program' },
    );
    await expect(refused).rejects.toThrow(AdminConfigError);
    await expect(refused).rejects.toThrow('programs[0].redirectUris[0]');
    expect(await repository.version()).toBe(before);
    expect(repository.load().programs.programs).toEqual([]);
  } finally {
    directory.cleanup();
  }
});

test('a repository made before the document existed reads as no programs', async () => {
  const directory = tempDataDir();
  try {
    const repository = await repositoryWithFiles(directory.root);
    rmSync(join(directory.root, 'admin', 'programs.json'));
    expect(existsSync(join(directory.root, 'admin', 'programs.json'))).toBe(false);
    expect(repository.load().programs.programs).toEqual([]);
  } finally {
    directory.cleanup();
  }
});
