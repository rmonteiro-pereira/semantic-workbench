// Tests the project export: which files the zip holds, byte-exact content, the size limit, the
// Git bundle option and the round trip through the import route.
import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '../src/server/projects/atomic';
import { TooLargeError } from '../src/server/projects/errors';
import { projectDir } from '../src/server/projects/paths';
import { HISTORY_BUNDLE_NAME, selectExportPaths } from '../src/server/projects/project-export';
import { LOCAL_READER } from '../src/server/projects/reader';
import { errorResponse } from '../src/server/routes/http';
import { zipSize, zipStream } from '../src/server/projects/zip';
import { example, testWorkspace } from './helpers/temp-data-dir';
import { readZip } from './helpers/zip-reader';

const CONTRACT_FIXTURE = 'tests/fixtures/auth-workspace/projects/sales-contracts/orders.odcs.yaml';
const ORIGIN = 'http://127.0.0.1:4310';
const NO_HISTORY = { includeHistory: false, historyAllowed: true };

// Comments, CRLF line endings and a trailing blank line must come back exactly as stored.
const ODDLY_FORMATTED = '# kept comment\r\n' + readFileSync(CONTRACT_FIXTURE, 'utf8').replaceAll('\n', '\r\n') + '\r\n\r\n';

async function projectWithFiles() {
  const t = await testWorkspace();
  const files = [
    { path: 'flights.ontology.yaml', source: await example('ossie', 'flights.ontology.yaml') },
    { path: 'odd.odcs.yaml', source: ODDLY_FORMATTED },
    { path: 'nested/flights.mapping.yaml', source: await example('ossie', 'flights.mapping.yaml') },
    { path: '.gitignore', source: '*.log\nbuild/\n' },
  ];
  const { slug } = await t.seed(files, 'Export me');
  return { t, slug, files };
}

async function download(t: { handler: (request: Request) => Promise<Response> }, path: string) {
  return t.handler(new Request(ORIGIN + path));
}

test('the zip holds every stored file byte for byte, with the folder structure and .gitignore', async () => {
  const { t, slug, files } = await projectWithFiles();
  try {
    const response = await download(t, `/api/projects/${slug}/export`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain(`${slug}.zip`);
    const archive = new Uint8Array(await response.arrayBuffer());
    expect(response.headers.get('content-length')).toBe(String(archive.length));
    const stored = readZip(archive);
    expect([...stored.keys()].sort()).toEqual(files.map(file => file.path).sort());
    for (const file of files) {
      const expected = sha256(new TextEncoder().encode(file.source));
      expect(sha256(stored.get(file.path)!), file.path).toBe(expected);
    }
  } finally {
    t.dispose();
  }
});

test('git-ignored files, the .git folder and unsaved drafts are not exported', async () => {
  const { t, slug } = await projectWithFiles();
  try {
    const dir = projectDir(t.ws.layout, slug);
    writeFileSync(join(dir, 'debug.log'), 'ignored by .gitignore');
    mkdirSync(join(dir, 'build'));
    writeFileSync(join(dir, 'build', 'out.txt'), 'ignored folder');
    writeFileSync(join(dir, 'notes.txt'), 'untracked but not ignored');
    t.ws.state.writeDraft(slug, 'odd.odcs.yaml', {
      baseHash: null,
      text: 'DRAFT-TEXT-NOT-SAVED',
      patches: [],
    });
    const response = await download(t, `/api/projects/${slug}/export`);
    const stored = readZip(new Uint8Array(await response.arrayBuffer()));
    const names = [...stored.keys()];
    expect(names).toContain('notes.txt');
    expect(names).not.toContain('debug.log');
    expect(names.some(name => name.startsWith('build/'))).toBe(false);
    expect(names.some(name => name.split('/').includes('.git'))).toBe(false);
    const oddText = new TextDecoder().decode(stored.get('odd.odcs.yaml')!);
    expect(oddText).toBe(ODDLY_FORMATTED);
    expect(oddText).not.toContain('DRAFT-TEXT');
  } finally {
    t.dispose();
  }
});

test('a symbolic link in the project is left out of the zip', async () => {
  const { t, slug } = await projectWithFiles();
  try {
    const dir = projectDir(t.ws.layout, slug);
    const outside = mkdtempSync(join(tmpdir(), 'workbench-outside-'));
    writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE-SECRET');
    try {
      Bun.spawnSync(['ln', '-s', join(outside, 'secret.txt'), join(dir, 'link.txt')]);
      const response = await download(t, `/api/projects/${slug}/export`);
      const archive = new Uint8Array(await response.arrayBuffer());
      const stored = readZip(archive);
      expect([...stored.keys()]).not.toContain('link.txt');
      expect(new TextDecoder('latin1').decode(archive)).not.toContain('OUTSIDE-SECRET');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    t.dispose();
  }
});

test('an export over the size limit is refused before any archive is built', async () => {
  const { t, slug } = await projectWithFiles();
  try {
    const limit = 100;
    const refused = t.ws.exportProject(slug, LOCAL_READER, NO_HISTORY, limit);
    await expect(refused).rejects.toBeInstanceOf(TooLargeError);
    const response = errorResponse(new TooLargeError('too big', limit));
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe('too big');
    const fits = await t.ws.exportProject(slug, LOCAL_READER, NO_HISTORY, 10_000_000);
    expect(fits.fileCount).toBe(4);
  } finally {
    t.dispose();
  }
});

test('the bundle is added only when asked, and it clones back to the same files', async () => {
  const { t, slug, files } = await projectWithFiles();
  try {
    const plain = await download(t, `/api/projects/${slug}/export`);
    expect([...readZip(new Uint8Array(await plain.arrayBuffer())).keys()]).not.toContain(HISTORY_BUNDLE_NAME);
    const response = await download(t, `/api/projects/${slug}/export?history=1`);
    expect(response.status).toBe(200);
    const stored = readZip(new Uint8Array(await response.arrayBuffer()));
    const bundle = stored.get(HISTORY_BUNDLE_NAME)!;
    expect(bundle).toBeDefined();
    const scratch = mkdtempSync(join(tmpdir(), 'workbench-bundle-'));
    try {
      writeFileSync(join(scratch, 'history.bundle'), bundle);
      const clone = Bun.spawnSync(['git', 'clone', '-q', join(scratch, 'history.bundle'), join(scratch, 'copy')], { env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
      expect(clone.exitCode, clone.stderr.toString()).toBe(0);
      const cloned = await Bun.file(join(scratch, 'copy', 'odd.odcs.yaml')).text();
      expect(cloned).toBe(files[1].source);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  } finally {
    t.dispose();
  }
});

test('a history flag that is neither 1 nor 0 is refused', async () => {
  const t = await testWorkspace();
  try {
    const created = await t.ws.createProject('Empty');
    const response = await download(t, `/api/projects/${created.slug}/export?history=maybe`);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('history');
  } finally {
    t.dispose();
  }
});

test('exporting then importing into a new project gives equal file hashes', async () => {
  const { t, slug, files } = await projectWithFiles();
  try {
    const response = await download(t, `/api/projects/${slug}/export`);
    const stored = readZip(new Uint8Array(await response.arrayBuffer()));
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const importFiles = [...stored].map(([path, bytes]) => ({
      path,
      source: decoder.decode(bytes),
    }));
    const imported = await t.ws.importBatch({ files: importFiles, name: 'Round trip' }, LOCAL_READER);
    expect(imported.slug).not.toBe(slug);
    for (const file of files) {
      const original = t.ws.readFile(slug, file.path).hash;
      const copy = t.ws.readFile(imported.slug, file.path).hash;
      expect(copy, file.path).toBe(original);
    }
  } finally {
    t.dispose();
  }
});

test('filtering drops git metadata and temporary files and counts unreadable paths only', () => {
  const paths = ['a.yaml', '.git/config', 'sub/.git/HEAD', 'x.yaml.workbench-tmp', 'secret/b.yaml'];
  const { included, restricted } = selectExportPaths(paths, path => !path.startsWith('secret/'));
  expect(included).toEqual(['a.yaml']);
  expect(restricted).toBe(1);
});

test('the zip writer announces its exact size and stops when a file changes mid-stream', async () => {
  const entries = [
    { name: 'a.txt', size: 3, read: () => new TextEncoder().encode('abc') },
    { name: 'dir/ü.txt', size: 0, read: () => new Uint8Array() },
  ];
  const archive = new Uint8Array(await new Response(zipStream(entries)).arrayBuffer());
  expect(archive.length).toBe(zipSize(entries));
  expect(new TextDecoder().decode(readZip(archive).get('a.txt')!)).toBe('abc');
  expect(readZip(archive).has('dir/ü.txt')).toBe(true);
  const changing = [{ name: 'a.txt', size: 5, read: () => new TextEncoder().encode('abc') }];
  await expect(new Response(zipStream(changing)).arrayBuffer()).rejects.toThrow('changed');
});
