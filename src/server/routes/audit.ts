// Applies project-scoped audit visibility before filtering, paging or exporting records.
import type { Route } from './http';
import type { HandlerOptions } from '../auth/middleware';
import { auditProjects, requestScope } from '../auth/request-scope';
import { exportAudit, queryAudit } from '../auth/audit';
import { AdminConfigError } from '../auth/admin-repo';

/** The first instant of the UTC month that contains `now`, as an ISO time. */
function startOfMonth(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Serves the audit query and download contract without exposing another domain's records. */
export function auditRoutes(options: HandlerOptions): Route {
  return (_workspace, request, url) => {
    if (!['/api/audit', '/api/audit/export'].includes(url.pathname) || request.method !== 'GET') return null;
    const scope = requestScope(request);
    const projects = auditProjects(request);
    const filters = Object.fromEntries(url.searchParams);
    if (filters.decision && !['allow', 'deny'].includes(filters.decision)) throw new AdminConfigError('Invalid audit decision.');
    for (const key of ['from', 'to']) {
      if (!filters[key]) continue;
      if (!Number.isFinite(Date.parse(filters[key]))) throw new AdminConfigError('Invalid audit time.');
      filters[key] = new Date(filters[key]).toISOString();
    }
    // Without a start the query covers the current month, so a request never reads every month.
    filters.from ??= startOfMonth(new Date());
    const stored = options.audit!.between(filters.from, filters.to);
    const entries = queryAudit(stored, filters, { scope, projects });
    if (url.pathname.endsWith('/export')) {
      const format = filters.format ?? 'jsonl';
      if (format !== 'jsonl' && format !== 'csv') throw new AdminConfigError('Invalid audit format.');
      return new Response(exportAudit(entries, format), {
        headers: {
          'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson',
          'Content-Disposition': `attachment; filename="audit.${format}"`,
        },
      });
    }
    if (filters.cursor && !/^\d+$/.test(filters.cursor)) throw new AdminConfigError('Invalid audit cursor.');
    const offset = Number(filters.cursor ?? 0);
    if (!Number.isSafeInteger(offset)) throw new AdminConfigError('Invalid audit cursor.');
    return Response.json({
      entries: entries.slice(offset, offset + 100),
      next: offset + 100 < entries.length ? String(offset + 100) : null,
    });
  };
}
