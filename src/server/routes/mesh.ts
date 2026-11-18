/** Routes public-interface discovery and dependency status through the operation boundary. */
import { isObject } from '../../shared/edit/source-text';
import { compareText } from '../../shared/tessera/canonical-json';
import { DEPENDENCY_MANIFEST_PATH, manifestIsCurrent, parseDependencyManifest, type DependencyManifest } from '../../shared/tessera/dependency-manifest';
import { declaredImports } from '../../shared/tessera/imports';
import { readMarker } from '../../shared/tessera/marker';
import { validateInput } from '../../shared/validation/input';
import { requestReader } from '../auth/request-scope';
import { BadRequestError, SnapshotUnavailableError } from '../projects/errors';
import { locationOf } from '../projects/paths';
import type { Reader } from '../projects/reader';
import type { Workspace } from '../projects/workspace';
import { decodeSegment } from '../request';
import { publishedProviders } from '../mesh/provider-resolution';
import type { Route } from './http';
import { updateDependencies } from './dependency-update';

const DEPENDENCIES_ROUTE = /^\/api\/projects\/([^/]+)\/dependencies$/;
const DEPENDENCY_UPDATE_ROUTE = /^\/api\/projects\/([^/]+)\/dependencies\/update$/;
const PAGE_SIZE = 50;

function providerCursor(project: string, ontology: string) {
  return Buffer.from(JSON.stringify([project, ontology])).toString('base64url');
}

function readCursor(value: string | null): [string, string] | undefined {
  if (!value) return undefined;
  try {
    if (value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding.');
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (Array.isArray(cursor) && cursor.length === 2 && cursor.every(part => typeof part === 'string')) return [cursor[0], cursor[1]];
  } catch (error) {
    throw new BadRequestError('Invalid provider page cursor.');
  }
  throw new BadRequestError('Invalid provider page cursor.');
}

async function listProviders(ws: Workspace, reader: Reader, url: URL) {
  const cursor = readCursor(url.searchParams.get('cursor'));
  const requested = url.searchParams.get('project');
  const registry = new Map(ws.state.registry().projects.map(entry => [entry.slug, entry]));
  const candidateProjects = requested ? [requested] : [...registry.keys()].sort(compareText);
  const resolution = {
    snapshots: ws.published,
    repositoryOf: (project: string) => {
      const entry = registry.get(project);
      return entry ? locationOf(entry).repo : null;
    },
  };
  return ws.published.withPin(async pin => {
    const providers = [];
    for (const project of candidateProjects) {
      if (cursor && compareText(project, cursor[0]) < 0) continue;
      const resolved = await publishedProviders(resolution, pin, reader, project).catch(error => {
        if (error instanceof SnapshotUnavailableError) return [];
        throw error;
      });
      for (const provider of resolved) {
        if (cursor && project === cursor[0] && compareText(provider.ontology, cursor[1]) <= 0) continue;
        providers.push({ project, name: registry.get(project)!.name, ontology: provider.ontology, version: provider.commit, concepts: [...provider.closure.concepts.keys()] });
        if (providers.length > PAGE_SIZE) {
          providers.pop();
          const last = providers.at(-1)!;
          return { providers, cursor: providerCursor(last.project, last.ontology) };
        }
      }
    }
    return { providers, cursor: null };
  });
}

async function dependencyStatus(ws: Workspace, reader: Reader, project: string) {
  ws.project(project);
  const documents = ws.documentsFor(reader).filter(document => document.project === project);
  const lock = documents.find(document => document.path === DEPENDENCY_MANIFEST_PATH);
  let manifest: DependencyManifest | undefined;
  if (lock) {
    try {
      manifest = parseDependencyManifest(lock.source);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
  }
  const publication = ws.state.published().repositories;
  const roots = documents.flatMap(document => {
    const model = validateInput(document.source, document.filename).model;
    if (!model || !('document' in model) || !isObject(model.document)) return [];
    const marker = readMarker(model.document);
    if (marker.family !== 'tessera' || marker.revision !== 3) return [];
    const imports = declaredImports(model.document);
    if (!imports.length) return [];
    const providersVisible = !reader.view || imports.every(entry => reader.view!.readableProjects.has(entry.project));
    const current = providersVisible && manifest?.root === document.path && manifestIsCurrent(manifest, imports);
    const available = current && manifest!.providers.some(provider => !provider.sameRepository && provider.choice === 'latest' && publication[provider.repository]?.commit !== provider.commit);
    let state = 'needs-update';
    if (current) state = available ? 'update-available' : 'current';
    return [{ path: document.path, imports: providersVisible ? imports : [], state }];
  });
  return { roots: roots.slice(0, PAGE_SIZE), manifestHash: lock?.hash ?? null };
}

/** Registers mesh reads for the interactive workbench. */
export const meshRoutes: Route = async (ws, req, url) => {
  if (req.method === 'POST') {
    const update = DEPENDENCY_UPDATE_ROUTE.exec(url.pathname);
    return update ? updateDependencies(ws, req, decodeSegment(update[1])) : null;
  }
  if (req.method !== 'GET') return null;
  if (url.pathname === '/api/mesh/providers') return Response.json(await listProviders(ws, requestReader(req), url), { headers: { 'Cache-Control': 'no-store' } });
  const match = DEPENDENCIES_ROUTE.exec(url.pathname);
  if (!match) return null;
  return Response.json(await dependencyStatus(ws, requestReader(req), decodeSegment(match[1])), { headers: { 'Cache-Control': 'no-store' } });
};
