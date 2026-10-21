import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { validateInput } from '../../src/input';
import { rdfSyntax } from '../../src/rdf';
import type { Issue } from '../../src/diagnostics';
import { decode, sha256, TEMP_SUFFIX } from './atomic';
import type { Cache, CachedFile } from './cache';
import type { Git, FileGitState } from './git';
import { projectDir, projectPath, type DataLayout } from './paths';
import { sqlFindings } from '../sql/lint';
// Folder scanner (FR-079, FR-092): list files the way Git sees them (.gitignore honoured by Git),
// hash every file, validate supported ones with the shared rules and index them into the cache.
// Unsupported types are indexed as hidden; supported files that fail validation stay visible.
export type Serialization =
  | 'yaml'
  | 'json'
  | 'turtle'
  | 'ntriples'
  | 'n3'
  | 'rdfxml'
  | 'gitignore'
  | 'unsupported';
export function serializationOf(path: string, source?: string): Serialization {
  const name = posix.basename(path).toLowerCase();
  if (name === '.gitignore') return 'gitignore';
  if (name.endsWith(TEMP_SUFFIX)) return 'unsupported';
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  if (['yaml', 'yml', 'odcs', 'ossie'].includes(ext)) return 'yaml';
  if (ext === 'json') return 'json';
  if (['ttl', 'shacl'].includes(ext)) return 'turtle';
  if (ext === 'nt') return 'ntriples';
  if (ext === 'n3') return 'n3';
  if (['rdf', 'xml'].includes(ext)) return 'rdfxml';
  if (ext === 'owl')
    return source !== undefined && rdfSyntax(source, name) === 'text/turtle' ? 'turtle' : 'rdfxml';
  return 'unsupported';
}
export type Indexed = {
  file: CachedFile;
  entities: { id: string; name: string; kind: string }[];
  findings: Issue[];
};
// Validate one file's bytes. Pure: used by the scanner and by saves before anything is written.
export function indexBytes(
  project: string,
  path: string,
  bytes: Uint8Array,
  gitState: FileGitState | 'unknown' = 'unknown',
): Indexed {
  const hash = sha256(bytes);
  const base = { project, path, hash, gitState, indexedAt: new Date().toISOString() };
  let serialization = serializationOf(path);
  if (serialization === 'unsupported')
    return {
      file: {
        ...base,
        serialization,
        docType: 'unsupported',
        layout: null,
        valid: true,
        visible: false,
      },
      entities: [],
      findings: [],
    };
  let source: string;
  try {
    source = decode(bytes);
  } catch (e) {
    return {
      file: {
        ...base,
        serialization,
        docType: 'unknown',
        layout: null,
        valid: false,
        visible: true,
      },
      entities: [],
      findings: [{ severity: 'error', code: 'encoding', path: '/', message: (e as Error).message }],
    };
  }
  serialization = serializationOf(path, source);
  if (serialization === 'gitignore')
    return {
      file: {
        ...base,
        serialization,
        docType: 'gitignore',
        layout: null,
        valid: true,
        visible: true,
      },
      entities: [],
      findings: [],
    };
  const result = validateInput(source, posix.basename(path));
  // SQL inside definitions: warnings only, never affecting validity (FR-052, FR-053).
  const sql =
    serialization === 'yaml' || serialization === 'json'
      ? sqlFindings(source, posix.basename(path))
      : [];
  return {
    file: {
      ...base,
      serialization,
      docType: result.model?.kind ?? 'unknown',
      layout: (result.model && 'layout' in result.model ? result.model.layout : null) ?? null,
      valid: result.valid,
      visible: true,
    },
    entities: result.model?.entities.map(e => ({ id: e.id, name: e.name, kind: e.kind })) ?? [],
    findings: [...result.issues, ...sql],
  };
}
function walk(dir: string, prefix = '', out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), rel, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}
export function createScanner(
  layout: DataLayout,
  cache: Cache,
  git: Git,
  gitAvailable: () => boolean,
) {
  const queues = new Map<string, Promise<unknown>>();
  async function scan(slug: string) {
    const dir = projectDir(layout, slug);
    let paths: string[];
    let states = new Map<string, FileGitState>();
    if (gitAvailable()) {
      paths = await git.lsFiles(dir);
      try {
        states = (await git.status(dir)).files;
      } catch {
        /* a repository without commits still lists files */
      }
    } else paths = walk(dir);
    const present = new Set<string>();
    const changed: string[] = [];
    const removed: string[] = [];
    for (const raw of paths) {
      let path: string;
      try {
        path = projectPath(raw);
      } catch {
        continue;
      }
      let bytes: Uint8Array;
      try {
        const file = join(dir, path);
        if (!statSync(file).isFile()) continue;
        bytes = readFileSync(file);
      } catch {
        continue;
      }
      present.add(path);
      const old = cache.file(slug, path);
      const gitState = states.get(path) ?? (gitAvailable() ? 'clean' : 'unknown');
      if (old && old.hash === sha256(bytes)) {
        if (old.gitState !== gitState)
          cache.put({ ...old, gitState }, cache.entities(slug, path), cache.findings(slug, path));
        continue;
      }
      const indexed = indexBytes(slug, path, bytes, gitState);
      cache.put(indexed.file, indexed.entities, indexed.findings);
      changed.push(path);
    }
    for (const old of cache.files(slug))
      if (!present.has(old.path)) {
        cache.remove(slug, old.path);
        removed.push(old.path);
      }
    return { project: slug, changed, removed };
  }
  return {
    // Scans of one project are serialized; concurrent requests share the queue.
    scan(slug: string): Promise<{ project: string; changed: string[]; removed: string[] }> {
      const next = (queues.get(slug) ?? Promise.resolve()).catch(() => {}).then(() => scan(slug));
      queues.set(slug, next);
      next
        .catch(() => {})
        .finally(() => {
          if (queues.get(slug) === next) queues.delete(slug);
        });
      return next;
    },
  };
}
export type Scanner = ReturnType<typeof createScanner>;
