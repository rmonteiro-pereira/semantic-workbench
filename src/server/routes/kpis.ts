// Previews metric changes and saves related files in one journaled operation. Previews never
// execute SQL.
import { BadRequestError, OccupiedError } from '../projects/errors';
import { requestReader } from '../auth/request-scope';
import { authorizeWrite } from '../auth/write-access';
import { decodeSegment, readJson } from '../request';
import { MAX_INPUT_BYTES } from '../../shared/validation/diagnostics';
import { explainMetric } from '../agent/explain';
import { planKpiSave, KpiError, type KpiRequest } from '../../shared/metrics/metric-save';
import { InputError } from '../../shared/validation/diagnostics';
import type { Route } from './http';
const HASH = /^[0-9a-f]{64}$/;
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Handles metric previews and journaled saves across related files. */
export const kpiRoutes: Route = async (ws, req, url) => {
  if (req.method !== 'POST') return null;
  const batch = url.pathname.match(/^\/api\/projects\/([^/]+)\/save-batch$/);
  if (batch) {
    const slug = decodeSegment(batch[1]);
    const body = await readJson(req, MAX_INPUT_BYTES * 6 + 4096);
    if (!object(body) || !Array.isArray(body.files) || Object.keys(body).some(k => k !== 'files'))
      throw new BadRequestError('Expected {files: [{path, baseHash, source} or {path, baseHash, patches}]}.');
    for (const file of body.files)
      if (
        !object(file) ||
        typeof file.path !== 'string' ||
        (file.baseHash !== null && (typeof file.baseHash !== 'string' || !HASH.test(file.baseHash))) ||
        (file.source === undefined) === (file.patches === undefined) ||
        (file.source !== undefined && typeof file.source !== 'string')
      )
        throw new BadRequestError('Each file needs a path, the SHA-256 of the version the edit started from (null for a new file), and either source or patches.');
    authorizeWrite(
      req,
      'edit',
      body.files.map((file: { path: string }) => ({
        type: 'file',
        project: slug,
        path: file.path,
      })),
    );
    const reader = requestReader(req);
    return Response.json(await ws.saveFiles(slug, body.files, reader, 'save-batch'));
  }
  // Keep the older `kpis` paths as aliases for existing clients.
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/(?:metrics|kpis)(\/preview)?$/);
  if (!match) return null;
  const slug = decodeSegment(match[1]);
  const preview = !!match[2];
  ws.project(slug);
  const body = await readJson(req, 256_000);
  if (
    !object(body) ||
    Object.keys(body).some(key => !['semanticPath', 'modelPath', 'existing', 'metric', 'extension', 'binding', 'baseHashes'].includes(key)) ||
    typeof body.semanticPath !== 'string' ||
    (body.existing !== undefined && typeof body.existing !== 'boolean') ||
    !object(body.metric) ||
    !object(body.extension) ||
    (body.binding !== undefined && !object(body.binding)) ||
    (body.modelPath !== undefined && !Array.isArray(body.modelPath)) ||
    (!preview && !object(body.baseHashes))
  )
    throw new BadRequestError('Expected {semanticPath, metric: {name, expression, description?, datatype?}, extension, binding?: {measures, of?}, baseHashes}.');
  const { view } = requestReader(req);
  const targetPaths = [body.semanticPath, ...Object.keys(body.baseHashes ?? {})];
  if (view && targetPaths.some(path => !view.canRead(slug, path))) {
    throw new OccupiedError('The target is unavailable.', {});
  }
  const documents = ws.documentsFor(requestReader(req)).filter(d => d.project === slug);
  let plan;
  try {
    plan = planKpiSave(
      documents.map(d => ({ path: d.path, source: d.source })),
      body as KpiRequest,
    );
  } catch (error) {
    if (error instanceof KpiError) throw new InputError([{ severity: 'error', code: 'kpi', path: '/', message: error.message }]);
    throw error;
  }
  if (preview) {
    const next = [
      ...documents.map(d => {
        const w = plan.writes.find(x => x.path === d.path);
        return w ? { ...d, source: w.source } : d;
      }),
      ...plan.writes
        .filter(w => w.created)
        .map(write => ({
          id: `${slug}/${write.path}`,
          filename: write.path.split('/').pop()!,
          source: write.source,
          revision: 1,
          project: slug,
          path: write.path,
        })),
    ];
    const changes = plan.writes.map(write => {
      const before = documents.find(d => d.path === write.path)?.source ?? '';
      const beforeLines = before ? before.split('\n') : [];
      const afterLines = write.source.split('\n');
      let commonPrefix = 0;
      while (commonPrefix < beforeLines.length && commonPrefix < afterLines.length && beforeLines[commonPrefix] === afterLines[commonPrefix]) commonPrefix++;
      let commonSuffix = 0;
      while (
        commonSuffix < beforeLines.length - commonPrefix &&
        commonSuffix < afterLines.length - commonPrefix &&
        beforeLines[beforeLines.length - 1 - commonSuffix] === afterLines[afterLines.length - 1 - commonSuffix]
      )
        commonSuffix++;
      return {
        path: write.path,
        created: write.created,
        added: afterLines.slice(commonPrefix, afterLines.length - commonSuffix),
        removed: beforeLines.slice(commonPrefix, beforeLines.length - commonSuffix),
      };
    });
    return Response.json({
      changes,
      explanation: explainMetric(next, slug, body.semanticPath, body.metric.name, {}),
    });
  }
  const writes = plan.writes.map(write => {
    if (write.created) return { path: write.path, baseHash: null, source: write.source };
    const hash = body.baseHashes[write.path];
    if (typeof hash !== 'string' || !HASH.test(hash)) throw new BadRequestError(`baseHashes must include the hash of ${write.path} as you last read it.`);
    return { path: write.path, baseHash: hash, source: write.source };
  });
  authorizeWrite(
    req,
    'edit',
    writes.map(file => ({ type: 'file', project: slug, path: file.path })),
  );
  return Response.json(await ws.saveFiles(slug, writes, requestReader(req), 'kpi'));
};
