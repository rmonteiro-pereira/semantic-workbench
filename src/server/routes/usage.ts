// Serves `GET /api/projects/:slug/usage`: the counts of a project's items for a period, limited to
// the documents the caller may read. The operation boundary has already decided access to the project.
import { requestReader } from '../auth/request-scope';
import { decodeSegment } from '../request';
import { periodDays } from '../usage/usage-retention';
import type { UsageRecorder } from '../usage/usage-recorder';
import { publishedMigrationRecords } from '../usage/usage-publication';
import { modelsOfDocuments, usageAddressExists } from '../usage/usage-items';
import { parseUsageQuery, readUsage } from '../usage/usage-read';
import { USAGE_OFF, type UsageSettings } from '../usage/usage-settings';
import { createUsageStore, type DayRead } from '../usage/usage-store';
import { utcDay } from '../usage/usage-retention';
import type { Route } from './http';

const USAGE_ROUTE = /^\/api\/projects\/([^/]+)\/usage$/;

/** Creates the route of the read operation over a recorder and the operator's settings. */
export function usageRoutes(usage: UsageRecorder, settings: UsageSettings = USAGE_OFF, clock: () => number = Date.now): Route {
  const effective: UsageSettings = { enabled: usage.enabled && settings.enabled, retentionDays: settings.retentionDays };
  return async (ws, req, url) => {
    const match = url.pathname.match(USAGE_ROUTE);
    if (!match || req.method !== 'GET') return null;
    const project = decodeSegment(match[1]);
    ws.project(project);
    const { days } = parseUsageQuery(url.searchParams, effective.retentionDays);
    const reader = requestReader(req);
    const today = utcDay(new Date(clock()));
    const store = createUsageStore(ws.layout);
    const canRead = (path: string) => !reader.view || reader.view.canRead(project, path);
    const answer = await ws.published.withPin(async pin => {
      const dayReads = new Map<string, DayRead>();
      const commit = ws.published.commitOf(pin, project);
      if (effective.enabled && commit) for (const day of periodDays(today, days)) dayReads.set(day, store.readDay(project, day));
      const pending = usage.pending(project);
      const records = effective.enabled ? publishedMigrationRecords(ws.layout, project, commit) : [];
      const [paths, documents] = effective.enabled && commit ? await Promise.all([ws.published.filePaths(pin, project), ws.published.documents(pin, project)]) : [[], []];
      const models = modelsOfDocuments(documents.filter(document => canRead(document.path)));
      return readUsage({
        settings: effective,
        project,
        days,
        today,
        dayReads,
        pending,
        records,
        canRead,
        resolves: address => usageAddressExists(models, address),
        readsWholeProject: !!commit && paths.every(canRead),
      });
    });
    return Response.json(answer, { headers: { 'Cache-Control': 'no-store' } });
  };
}
