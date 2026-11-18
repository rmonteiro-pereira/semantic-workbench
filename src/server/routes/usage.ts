// Serves `GET /api/projects/:slug/usage`: the counts of a project's items for a period, limited to
// the documents the caller may read. The operation boundary has already decided access to the project.
import { requestReader } from '../auth/request-scope';
import { readAddressMigrations } from '../projects/address-migrations';
import { decodeSegment } from '../request';
import type { Workspace } from '../projects/workspace';
import { periodDays } from '../usage/usage-retention';
import type { UsageRecorder } from '../usage/usage-recorder';
import { parseUsageQuery, readUsage } from '../usage/usage-read';
import { USAGE_OFF, type UsageSettings } from '../usage/usage-settings';
import { createUsageStore, type DayRead } from '../usage/usage-store';
import { utcDay } from '../usage/usage-retention';
import type { Reader } from '../projects/reader';
import type { Route } from './http';

const USAGE_ROUTE = /^\/api\/projects\/([^/]+)\/usage$/;

/** Whether the reader may read every file the published snapshot holds for the project. */
async function readsWholeProject(ws: Workspace, project: string, reader: Reader): Promise<boolean> {
  const { view } = reader;
  if (!view) return true;
  try {
    const paths = await ws.published.withPin(pin => ws.published.filePaths(pin, project));
    return paths.every(path => view.canRead(project, path));
  } catch {
    return false;
  }
}

function migrationRecords(ws: Workspace, project: string, reader: Reader) {
  try {
    return readAddressMigrations(ws.layout, project, reader);
  } catch {
    return null;
  }
}

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
    const dayReads = new Map<string, DayRead>();
    if (effective.enabled) for (const day of periodDays(today, days)) dayReads.set(day, store.readDay(project, day));
    const answer = readUsage({
      settings: effective,
      project,
      days,
      today,
      dayReads,
      pending: usage.pending(project),
      records: migrationRecords(ws, project, reader),
      canRead: path => !reader.view || reader.view.canRead(project, path),
      readsWholeProject: effective.enabled ? await readsWholeProject(ws, project, reader) : true,
    });
    return Response.json(answer, { headers: { 'Cache-Control': 'no-store' } });
  };
}
