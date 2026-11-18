/** Handles the explicit preview and confirmation of a dependency update. */
import { isObject } from '../../shared/edit/source-text';
import {
  DEPENDENCY_MANIFEST_PATH,
  dependencyRoot,
  dependencyRoots,
  parseDependencyManifest,
  printDependencyManifest,
  projectDependencies,
  type RootDependencies,
} from '../../shared/tessera/dependency-manifest';
import { sha256Hex } from '../../shared/tessera/digest';
import { declaredImports } from '../../shared/tessera/imports';
import { readMarker } from '../../shared/tessera/marker';
import { validateInput } from '../../shared/validation/input';
import { requestReader } from '../auth/request-scope';
import { authorizeWrite } from '../auth/write-access';
import { planDependencyUpdate, requireOneProviderVersion } from '../mesh/dependency-update';
import { digestOf, interfaceChanges } from '../mesh/interface-changes';
import { exportedOntologies } from '../mesh/provider-resolution';
import { BadRequestError } from '../projects/errors';
import type { PublishedSnapshots } from '../projects/published-snapshot';
import type { Workspace } from '../projects/workspace';
import { FILE_SAVE_REQUEST_LIMIT, readJson } from '../request';

function parseUpdate(value: unknown) {
  if (!isObject(value)) throw new BadRequestError('Expected a dependency update request.');
  const { baseHash, confirm } = value;
  if (baseHash !== null && (typeof baseHash !== 'string' || !/^[a-f0-9]{64}$/.test(baseHash))) throw new BadRequestError('Expected a manifest base hash or null.');
  if (confirm !== undefined && (typeof confirm !== 'string' || !/^[a-f0-9]{64}$/.test(confirm))) throw new BadRequestError('Expected a preview hash to confirm the update.');
  return { baseHash, confirm };
}

async function summarizePrevious(
  snapshots: PublishedSnapshots,
  pin: Parameters<PublishedSnapshots['documents']>[0],
  previous: RootDependencies | undefined,
  resolved: Awaited<ReturnType<typeof planDependencyUpdate>>['resolved'],
) {
  return Promise.all(
    resolved.map(async ({ provider, hashes }) => {
      const prior = previous?.providers.find(entry => entry.project === provider.project && entry.ontology === provider.ontology);
      const commit = prior?.commit ?? (prior?.sameRepository ? pin.commits.get(prior.repository)?.commit : undefined);
      if (!commit) return { project: provider.project, ontology: provider.ontology, ...interfaceChanges(new Map(), hashes) };
      const snapshot = await snapshots.pinnedDocumentsAt(pin, provider.project, commit);
      const priorProvider = exportedOntologies(provider.project, provider.repository, commit, snapshot?.documents ?? []).find(entry => entry.ontology === provider.ontology);
      const before = priorProvider ? digestOf(priorProvider.closure.concepts) : new Map();
      return { project: provider.project, ontology: provider.ontology, ...interfaceChanges(before, hashes) };
    }),
  );
}

/** Re-resolves a dependency update and writes the lock only when the author confirms those bytes. */
export async function updateDependencies(ws: Workspace, req: Request, project: string): Promise<Response> {
  authorizeWrite(req, 'edit', [{ type: 'file', project, path: DEPENDENCY_MANIFEST_PATH }]);
  const request = parseUpdate(await readJson(req, FILE_SAVE_REQUEST_LIMIT));
  const reader = requestReader(req);
  const repository = ws.repoOf(project);
  const documents = ws.dependencyCandidateDocuments(project, project, reader);
  const current = documents.find(file => file.path === DEPENDENCY_MANIFEST_PATH);
  if ((current?.hash ?? null) !== request.baseHash) return Response.json({ error: 'manifest-changed' }, { status: 409 });
  const previous = current ? parseDependencyManifest(current.source) : undefined;
  const roots = documents.flatMap(file => {
    const model = validateInput(file.source, file.filename).model;
    if (!model || !('document' in model) || !isObject(model.document)) return [];
    const marker = readMarker(model.document);
    if (!(marker.family === 'tessera') || marker.revision !== 3) return [];
    const imports = declaredImports(model.document);
    return imports.length || (previous && dependencyRoot(previous, file.path)) ? [{ file, imports }] : [];
  });
  if (previous && reader.view && dependencyRoots(previous).some(entry => !reader.view!.canRead(project, entry.root))) {
    throw new BadRequestError('The dependency manifest covers an unavailable ontology.');
  }
  if (!roots.length && !previous) throw new BadRequestError('Expected an importing ontology for this dependency update.');
  return ws.published.withPin(async pin => {
    const registry = new Set(ws.state.registry().projects.map(entry => entry.slug));
    const source = {
      snapshots: ws.published,
      repositoryOf: (name: string) => (registry.has(name) ? ws.repoOf(name) : null),
      workingDocuments: (name: string) => ws.dependencyCandidateDocuments(project, name, reader),
    };
    const updates = await Promise.all(roots.map(({ file, imports }) => planDependencyUpdate(source, pin, reader, repository, file.path, imports)));
    requireOneProviderVersion(updates.flatMap(update => update.manifest.providers));
    const manifests = updates.map(update => update.manifest);
    if (!manifests.length && previous) manifests.push({ root: previous.root, providers: [] });
    const lock = printDependencyManifest(projectDependencies(manifests));
    const preview = sha256Hex(lock);
    if (!request.confirm) {
      const changes = await Promise.all(updates.map(({ manifest, resolved }) => summarizePrevious(ws.published, pin, previous ? dependencyRoot(previous, manifest.root) : undefined, resolved)));
      return Response.json({ preview, changes: changes.flat() });
    }
    if (request.confirm !== preview) return Response.json({ error: 'preview-changed' }, { status: 409 });
    return Response.json(await ws.writeDependencyManifest(project, { baseHash: request.baseHash, source: lock }, new Map(roots.map(({ file }) => [file.path, file.hash])), reader));
  });
}
