/** Finds the active and archived grouping stores that contain entity keys. */
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readJsonFile } from './atomic';
import { copyLayout, projectFile, projectPath, type DataLayout } from './paths';
import { createState } from './state';
import type { TrashEntry } from './trash';
import { readdirRecursive } from './trash-access';

/** Locates one grouping store and the definitions its keys describe. */
export type AddressKeyStore = {
  path: string;
  project: string;
  source: (document: string) => string | null;
  embeddedPath?: string;
};

function viewStores(directory: string, source: (project: string, document: string) => string | null): AddressKeyStore[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const project = name.slice(0, -5);
      return { path: join(directory, name), project, source: (document: string) => source(project, document) };
    });
}

function archivedSource(directory: string, entry: TrashEntry, project: string, document: string): string | null {
  document = projectPath(document);
  if (entry.kind === 'file') return entry.path === document ? join(directory, 'payload', basename(document)) : null;
  if (entry.kind === 'repository') {
    const member = entry.projects?.find(candidate => candidate.slug === project);
    return member ? join(directory, 'payload', member.folder ?? member.slug, document) : null;
  }
  return project === entry.project ? join(directory, 'payload', entry.project, document) : null;
}

function archivedStores(layout: DataLayout): AddressKeyStore[] {
  const stores: AddressKeyStore[] = [];
  for (const name of readdirSync(layout.trash)) {
    const directory = join(layout.trash, name);
    const entry = readJsonFile<TrashEntry>(join(directory, 'entry.json'));
    if (!entry) continue;
    if (entry.formatVersion !== 1) throw new Error('Unsupported archived grouping format.');
    const source = (project: string, document: string) => archivedSource(directory, entry, project, document);
    if (entry.view !== undefined && entry.path)
      stores.push({ path: join(directory, 'entry.json'), project: entry.project, source: document => source(entry.project, document), embeddedPath: entry.path });
    if (existsSync(join(directory, 'view.json'))) stores.push({ path: join(directory, 'view.json'), project: entry.project, source: document => source(entry.project, document) });
    stores.push(...viewStores(join(directory, 'views'), source));
    const personal = join(directory, 'personal');
    if (!existsSync(personal)) continue;
    for (const relative of readdirRecursive(personal).filter(path => path.endsWith('/view.json'))) {
      const project = relative.split('/').at(-2)!;
      stores.push({ path: join(personal, relative), project, source: document => source(project, document) });
    }
  }
  return stores;
}

/** Enumerates known stores without interpreting document paths as item locators. */
export function addressKeyStores(layout: DataLayout): AddressKeyStore[] {
  const source = (project: string, document: string) => projectFile(layout, project, document);
  const stores = viewStores(layout.views, source);
  for (const owner of createState(layout).personalStates()) {
    const directory = join(layout.state, 'users', owner.key, 'views');
    stores.push(
      ...viewStores(directory, (project, document) => {
        const copy = projectFile(copyLayout(layout, owner.key), project, document);
        return existsSync(copy) ? copy : source(project, document);
      }),
    );
  }
  return [...stores, ...archivedStores(layout)];
}
