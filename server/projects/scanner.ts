// Indexes project files using Git ignore rules and shared validation. Unsupported files stay hidden
// while invalid supported files remain visible.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { validateInput } from '../../src/input';
import { rdfSyntax } from '../../src/rdf';
import type { Issue } from '../../src/diagnostics';
import { decode, sha256, TEMP_SUFFIX } from './atomic';
import type { CachedFile, CopyIndex } from './cache';
import type { Git, FileGitState } from './git';
import {
  assertExactCase,
  CaseVariantError,
  projectDir,
  projectPath,
  projectPrefix,
  type DataLayout,
  type DirectoryLister,
} from './paths';
import { sqlFindings } from '../sql/lint';
/** A recognized file syntax, Git ignore file, or unsupported format. */
export type Serialization =
  | 'yaml'
  | 'json'
  | 'turtle'
  | 'ntriples'
  | 'n3'
  | 'rdfxml'
  | 'gitignore'
  | 'unsupported';
/** The repository manifest that lists project folders: workbench settings, not a definition. */
export const MANIFEST_FILE = '.semantic-workbench.json';
/** Infers a file format from its path, consulting source text for ambiguous OWL files. */
export function serializationOf(path: string, source?: string): Serialization {
  const name = posix.basename(path).toLowerCase();
  if (name === '.gitignore') return 'gitignore';
  if (name === MANIFEST_FILE) return 'unsupported';
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
/** A file’s cache metadata, extracted entities, and validation findings. */
export type Indexed = {
  file: CachedFile;
  entities: { id: string; name: string; kind: string }[];
  findings: Issue[];
};
/** Validates bytes without writing, for both indexing and save checks. */
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
  // SQL findings are warnings only and do not make a document invalid.
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
/** Lists a folder's files without Git, skipping the Git metadata folder. */
export function walk(dir: string, prefix = '', out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), rel, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}
/** Creates serialized project scans that refresh the cache and publish file changes. */
export function createScanner(
  layout: DataLayout,
  cache: CopyIndex,
  git: Git,
  gitAvailable: () => boolean,
  listDirectory: DirectoryLister = readdirSync,
) {
  const queues = new Map<string, Promise<unknown>>();
  // Another working copy may hold the same bytes at the same path; its parse is reused.
  function indexedOnce(
    slug: string,
    path: string,
    bytes: Uint8Array,
    gitState: FileGitState | 'unknown',
  ) {
    const hash = sha256(bytes);
    const known = cache.parsedElsewhere(slug, path, hash);
    if (known) {
      const file = { ...known.file, gitState, indexedAt: new Date().toISOString() };
      return [file, cache.entitiesOf(hash, path), known.findings] as const;
    }
    const indexed = indexBytes(slug, path, bytes, gitState);
    return [indexed.file, indexed.entities, indexed.findings] as const;
  }
  async function scan(slug: string) {
    const dir = projectDir(layout, slug);
    let paths: string[];
    let states = new Map<string, FileGitState>();
    if (gitAvailable()) {
      paths = await git.lsFiles(dir);
      try {
        // Git reports states by repository path; a subfolder project keeps only its own files.
        const prefix = projectPrefix(layout, slug);
        states = new Map(
          [...(await git.status(dir)).files]
            .filter(([path]) => path.startsWith(prefix))
            .map(([path, gitState]) => [path.slice(prefix.length), gitState] as const),
        );
      } catch {
        /* File listing still works when the repository has no commits. */
      }
    } else paths = walk(dir);
    // Git lists paths in the spelling of its index, which a volume that ignores case can keep
    // apart from the disk's. Each folder is listed once per scan.
    const listings = new Map<string, string[] | Error>();
    const listOnce: DirectoryLister = folder => {
      if (!listings.has(folder)) {
        try {
          listings.set(folder, listDirectory(folder));
        } catch (error) {
          listings.set(folder, error as Error);
        }
      }
      const listing = listings.get(folder)!;
      if (listing instanceof Error) throw listing;
      return listing;
    };
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
      try {
        assertExactCase(dir, path, listOnce);
      } catch (error) {
        if (error instanceof CaseVariantError) continue;
        throw error;
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
      cache.put(...indexedOnce(slug, path, bytes, gitState));
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
/** Scans project folders into the rebuildable file index. */
export type Scanner = ReturnType<typeof createScanner>;
