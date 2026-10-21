// Previews metric changes and saves related files in one journaled operation. Previews never
// execute SQL.
import { readJson } from '../request';
import { MAX_INPUT_BYTES } from '../../src/diagnostics';
import { explainMetric } from '../agent/explain';
import { planKpiSave, KpiError, type KpiRequest } from '../../src/metrics/metric-save';
import { InputError } from '../../src/diagnostics';
import type { Route } from './http';
const HASH = /^[0-9a-f]{64}$/;
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
/** Handles metric previews and journaled saves across related files. */
export const kpiRoutes: Route = async (ws, req, url) => {
  if (req.method !== 'POST') return null;
  const batch = url.pathname.match(/^\/api\/projects\/([^/]+)\/save-batch$/);
  if (batch) {
    const slug = decodeURIComponent(batch[1]);
    const body = await readJson(req, MAX_INPUT_BYTES * 6 + 4096);
    if (!object(body) || !Array.isArray(body.files) || Object.keys(body).some(k => k !== 'files'))
      throw Error('Expected {files: [{path, baseHash, source} or {path, baseHash, patches}]}.');
    for (const f of body.files)
      if (
        !object(f) ||
        typeof f.path !== 'string' ||
        (f.baseHash !== null && (typeof f.baseHash !== 'string' || !HASH.test(f.baseHash))) ||
        (f.source === undefined) === (f.patches === undefined) ||
        (f.source !== undefined && typeof f.source !== 'string')
      )
        throw Error(
          'Each file needs a path, the SHA-256 of the version the edit started from (null for a new file), and either source or patches.',
        );
    return Response.json(await ws.saveFiles(slug, body.files, 'save-batch'));
  }
  // Keep the older `kpis` paths as aliases for existing clients.
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/(?:metrics|kpis)(\/preview)?$/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]);
  const preview = !!m[2];
  ws.project(slug);
  const body = await readJson(req, 256_000);
  if (
    !object(body) ||
    Object.keys(body).some(
      k =>
        ![
          'semanticPath',
          'modelPath',
          'existing',
          'metric',
          'extension',
          'binding',
          'baseHashes',
        ].includes(k),
    ) ||
    typeof body.semanticPath !== 'string' ||
    (body.existing !== undefined && typeof body.existing !== 'boolean') ||
    !object(body.metric) ||
    !object(body.extension) ||
    (body.binding !== undefined && !object(body.binding)) ||
    (body.modelPath !== undefined && !Array.isArray(body.modelPath)) ||
    (!preview && !object(body.baseHashes))
  )
    throw Error(
      'Expected {semanticPath, metric: {name, expression, description?, datatype?}, extension, binding?: {measures, of?}, baseHashes}.',
    );
  const documents = ws.documents().filter(d => d.project === slug);
  let plan;
  try {
    plan = planKpiSave(
      documents.map(d => ({ path: d.path, source: d.source })),
      body as KpiRequest,
    );
  } catch (e) {
    if (e instanceof KpiError)
      throw new InputError([{ severity: 'error', code: 'kpi', path: '/', message: e.message }]);
    throw e;
  }
  if (preview) {
    const next = [
      ...documents.map(d => {
        const w = plan.writes.find(x => x.path === d.path);
        return w ? { ...d, source: w.source } : d;
      }),
      ...plan.writes
        .filter(w => w.created)
        .map(w => ({
          id: `${slug}/${w.path}`,
          filename: w.path.split('/').pop()!,
          source: w.source,
          revision: 1,
          project: slug,
          path: w.path,
        })),
    ];
    const changes = plan.writes.map(w => {
      const before = documents.find(d => d.path === w.path)?.source ?? '';
      const a = before ? before.split('\n') : [];
      const b = w.source.split('\n');
      let p = 0;
      while (p < a.length && p < b.length && a[p] === b[p]) p++;
      let s = 0;
      while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s])
        s++;
      return {
        path: w.path,
        created: w.created,
        added: b.slice(p, b.length - s),
        removed: a.slice(p, a.length - s),
      };
    });
    return Response.json({
      changes,
      explanation: explainMetric(next, slug, body.semanticPath, body.metric.name, {}),
    });
  }
  const writes = plan.writes.map(w => {
    if (w.created) return { path: w.path, baseHash: null, source: w.source };
    const hash = body.baseHashes[w.path];
    if (typeof hash !== 'string' || !HASH.test(hash))
      throw Error(`baseHashes must include the hash of ${w.path} as you last read it.`);
    return { path: w.path, baseHash: hash, source: w.source };
  });
  return Response.json(await ws.saveFiles(slug, writes, 'kpi'));
};
