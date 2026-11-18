/** Handles the explicit preview and confirmation of a dependency update. */
import { isObject } from '../../shared/edit/source-text';
import { DEPENDENCY_MANIFEST_PATH, parseDependencyManifest, printDependencyManifest } from '../../shared/tessera/dependency-manifest';
import { sha256Hex } from '../../shared/tessera/digest';
import { declaredImports } from '../../shared/tessera/imports';
import { readMarker } from '../../shared/tessera/marker';
import { validateInput } from '../../shared/validation/input';
import { requestReader } from '../auth/request-scope';
import { authorizeWrite } from '../auth/write-access';
import { planDependencyUpdate } from '../mesh/dependency-update';
import { digestOf, interfaceChanges } from '../mesh/interface-changes';
import { exportedOntologies } from '../mesh/provider-resolution';
import { BadRequestError } from '../projects/errors';
import type { PublishedSnapshots } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
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
  reader: Reader,
  previous: ReturnType<typeof parseDependencyManifest> | undefined,
  resolved: Awaited<ReturnType<typeof planDependencyUpdate>>['resolved'],
) {
  return Promise.all(
    resolved.map(async ({ provider, hashes }) => {
      const prior = previous?.providers.find(entry => entry.project === provider.project && entry.ontology === provider.ontology);
      const commit = prior?.commit ?? (prior?.sameRepository ? pin.commits.get(prior.repository)?.commit : undefined);
      if (!commit) return { project: provider.project, ontology: provider.ontology, ...interfaceChanges(new Map(), hashes) };
      const snapshot = await snapshots.pinnedDocumentsAt(pin, provider.project, commit);
      const visible = snapshot?.documents.filter(file => !reader.view || reader.view.canRead(provider.project, file.path)) ?? [];
      const priorProvider = exportedOntologies(provider.project, provider.repository, commit, visible).find(entry => entry.ontology === provider.ontology);
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
    return imports.length || previous?.root === file.path ? [{ file, imports }] : [];
  });
  if (roots.length !== 1) throw new BadRequestError('Expected exactly one importing root for this dependency update.');
  const [{ file, imports }] = roots;
  return ws.published.withPin(async pin => {
    const registry = new Set(ws.state.registry().projects.map(entry => entry.slug));
    const source = {
      snapshots: ws.published,
      repositoryOf: (name: string) => (registry.has(name) ? ws.repoOf(name) : null),
      workingDocuments: (name: string) => ws.dependencyCandidateDocuments(project, name, reader),
    };
    const { manifest, resolved } = await planDependencyUpdate(source, pin, reader, repository, file.path, imports);
    const lock = printDependencyManifest(manifest);
    const preview = sha256Hex(lock);
    if (!request.confirm) return Response.json({ preview, changes: await summarizePrevious(ws.published, pin, reader, previous, resolved) });
    if (request.confirm !== preview) return Response.json({ error: 'preview-changed' }, { status: 409 });
    return Response.json(await ws.writeDependencyManifest(project, { baseHash: request.baseHash, source: lock }, new Map([[file.path, file.hash]]), reader));
  });
}
