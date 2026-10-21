import { Database } from 'bun:sqlite';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { exampleForFilename } from '../../src/projects/examples';
import { atomicWrite, atomicWriteJson, sha256 } from './atomic';
import type { Git } from './git';
import type { Journal } from './journal';
import {
  disambiguate,
  projectDir,
  projectPath,
  slugify,
  uniqueName,
  type DataLayout,
} from './paths';
import type { State, ProjectEntry } from './state';
// One-time migration of a v0.1.0 workspace (research R8, FR-089). The old database is never opened
// or modified: it is copied to data/backup/ and the copy is read. Every exported file is re-read and
// its SHA-256 compared with the stored source; any mismatch stops before anything is moved into place.
export type MigrationReport = {
  status: 'completed' | 'postponed' | 'failed';
  reason?: string;
  backup?: string;
  projects: { slug: string; name: string; files: number }[];
  files: number;
  verified: number;
};
export type MigrationHooks = { afterWrite?: (file: string) => void };
type Context = {
  layout: DataLayout;
  state: State;
  journal: Journal;
  git: Git;
  gitAvailable: boolean;
  identityConfigured: boolean;
};
export const MIGRATION_COMMIT = 'Import from Semantic Workbench v0.1.0';
export async function migrateLegacy(
  ctx: Context,
  hooks: MigrationHooks = {},
): Promise<MigrationReport | null> {
  const { layout, state, journal, git } = ctx;
  // legacy-ids.json marks a finished migration; projects created meanwhile are kept and merged.
  if (!existsSync(layout.legacyDb) || existsSync(layout.legacyIds)) return null;
  const empty = { projects: [], files: 0, verified: 0 };
  if (!ctx.gitAvailable)
    return {
      status: 'postponed',
      reason:
        'Git 2.40 or newer is required to create project repositories. Install Git and restart; the v0.1.0 database is untouched.',
      ...empty,
    };
  if (!ctx.identityConfigured)
    return {
      status: 'postponed',
      reason:
        'Git user.name and user.email are not configured, so the initial commits cannot be made. Configure them and restart; the v0.1.0 database is untouched.',
      ...empty,
    };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'),
    opId = journal.newId();
  const backup = join(layout.backup, `workbench-${stamp}.sqlite`);
  const staging = join(layout.projects, `.staging-${opId}`),
    stateStaging = join(layout.state, `.staging-${opId}`);
  // Back up the database together with its WAL and shared-memory files, then verify the copies.
  for (const suffix of ['', '-wal', '-shm']) {
    const from = layout.legacyDb + suffix;
    if (!existsSync(from)) continue;
    copyFileSync(from, backup + suffix);
    if (sha256(readFileSync(backup + suffix)) !== sha256(readFileSync(from)))
      return {
        status: 'failed',
        reason: `Backup copy of ${from} does not match the original.`,
        backup,
        ...empty,
      };
  }
  const readCopy = join(stateStaging, 'read.sqlite');
  try {
    mkdirSync(stateStaging, { recursive: true });
    copyFileSync(backup, readCopy);
    if (existsSync(backup + '-wal')) copyFileSync(backup + '-wal', readCopy + '-wal');
    const db = new Database(readCopy);
    let docs: { id: string; filename: string; bytes: Uint8Array }[],
      views: { document_id: string; grouping: string }[] = [];
    try {
      // Read the stored bytes themselves (CAST AS BLOB), not a decoded and re-encoded string.
      docs = (
        db
          .query(
            'SELECT id,filename,CAST(source AS BLOB) AS bytes FROM documents ORDER BY updated,rowid',
          )
          .all() as any[]
      ).map(r => ({ id: r.id, filename: r.filename, bytes: new Uint8Array(r.bytes) }));
      if (
        db
          .query("SELECT name FROM sqlite_master WHERE type='table' AND name='document_views'")
          .get()
      )
        views = db.query('SELECT document_id,grouping FROM document_views').all() as any;
    } finally {
      db.close();
    }
    // Group: known example sets into their own projects, everything else into "Ungrouped".
    const names = state.registry().projects.map(p => p.name);
    const groups = new Map<
      string,
      { name: string; origin: string; preferred: string; docs: typeof docs }
    >();
    for (const d of docs) {
      const set = exampleForFilename(d.filename),
        key = set ? set.id : 'ungrouped';
      if (!groups.has(key))
        groups.set(
          key,
          set
            ? {
                name: uniqueName(set.name, names),
                origin: `example:${set.id}`,
                preferred: set.id,
                docs: [],
              }
            : {
                name: uniqueName('Ungrouped', names),
                origin: 'migration',
                preferred: 'ungrouped',
                docs: [],
              },
        );
      groups.get(key)!.docs.push(d);
    }
    const taken = new Set<string>([
        ...readdirSync(layout.projects),
        ...state.registry().projects.map(p => p.slug),
      ]),
      registry: ProjectEntry[] = [],
      ids: Record<string, { project: string; path: string }> = {};
    const viewFiles = new Map<string, Record<string, unknown>>(),
      grouping = new Map(views.map(v => [v.document_id, v.grouping]));
    const report: MigrationReport = {
      status: 'completed',
      backup,
      projects: [],
      files: 0,
      verified: 0,
    };
    for (const group of groups.values()) {
      const slug = taken.has(group.preferred) ? slugify(group.name, taken) : group.preferred;
      taken.add(slug);
      const dir = join(staging, slug),
        paths = new Set<string>();
      for (const d of group.docs) {
        let name = d.filename;
        try {
          projectPath(name);
          if (name.includes('/')) throw Error();
        } catch {
          name = `document-${d.id.slice(0, 8)}.txt`;
        }
        const path = disambiguate(name, paths);
        paths.add(path);
        const bytes = d.bytes,
          file = join(dir, path),
          expected = sha256(bytes);
        atomicWrite(file, bytes);
        hooks.afterWrite?.(file);
        report.files++;
        if (sha256(readFileSync(file)) !== expected)
          throw Error(
            `Verification failed for ${d.filename} (${d.id}): written bytes differ from the stored source.`,
          );
        report.verified++;
        ids[d.id] = { project: slug, path };
        const g = grouping.get(d.id);
        if (g !== undefined) {
          const files = viewFiles.get(slug) ?? {};
          try {
            files[path] = JSON.parse(g);
          } catch {}
          viewFiles.set(slug, files);
        }
      }
      await git.init(dir);
      await git.addAll(dir);
      await git.commit(dir, MIGRATION_COMMIT);
      registry.push({
        slug,
        name: group.name,
        createdAt: new Date().toISOString(),
        origin: group.origin,
      });
      report.projects.push({ slug, name: group.name, files: group.docs.length });
    }
    // Move everything into place in one journaled operation; the registry goes last because its
    // presence marks the migration as done.
    const steps: { from: string; to: string }[] = report.projects.map(p => ({
      from: join(staging, p.slug),
      to: projectDir(layout, p.slug),
    }));
    for (const [slug, files] of viewFiles) {
      const staged = join(stateStaging, 'views', slug + '.json');
      atomicWriteJson(staged, { formatVersion: 1, files });
      steps.push({ from: staged, to: join(layout.views, slug + '.json') });
    }
    atomicWriteJson(join(stateStaging, 'legacy-ids.json'), { formatVersion: 1, ids });
    steps.push({ from: join(stateStaging, 'legacy-ids.json'), to: layout.legacyIds });
    const existing = state.registry().projects;
    atomicWriteJson(join(stateStaging, 'projects.json'), {
      formatVersion: 1,
      projects: [...existing, ...registry],
    });
    if (existsSync(layout.registry))
      steps.push({ from: layout.registry, to: join(stateStaging, 'projects.previous.json') });
    steps.push({ from: join(stateStaging, 'projects.json'), to: layout.registry });
    rmSync(readCopy, { force: true });
    rmSync(readCopy + '-wal', { force: true });
    rmSync(readCopy + '-shm', { force: true });
    journal.run('migration', steps, [staging, stateStaging], opId);
    return report;
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    rmSync(stateStaging, { recursive: true, force: true });
    return { status: 'failed', reason: (e as Error).message, backup, ...empty };
  }
}
