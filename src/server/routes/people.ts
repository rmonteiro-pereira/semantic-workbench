// Lists the people who have signed in and may read a project, so a metric owner can be picked
// from them.
import { requestReader } from '../auth/request-scope';
import { ownerChoices } from '../auth/guards';
import type { AccessControl } from '../auth/authorize';
import type { Route } from './http';
import { decodeSegment } from '../request';

/**
 * Lists the people a project's metric owner can be chosen from: those with access who may read
 * the project, decided by the same policies as their own requests. Local mode has none.
 */
export function peopleRoutes(access: AccessControl): Route {
  return (ws, req, url) => {
    const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/people$/);
    if (!match || req.method !== 'GET') return null;
    const project = decodeSegment(match[1]);
    ws.project(project);
    if (!requestReader(req).view) return Response.json([]);
    const readers = ws.state.users().users.filter(user => {
      const principal = access.principalFor({ ...user, groupOverage: false });
      return access.authorize(principal, 'read', { type: 'project', project }).allow;
    });
    return Response.json(ownerChoices(readers));
  };
}
