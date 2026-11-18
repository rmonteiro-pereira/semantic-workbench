// Replay snapshots with explicit identities and targets for sampling tests.
import type { AuditEntry } from '../../src/server/auth/audit';

/** Minimal replayable record with a distinct identity and target. */
export function replayEntry(index: number, origin?: 'mcp' | 'acp'): AuditEntry {
  return {
    type: 'audit',
    at: '2026-10-01T00:00:00Z',
    prev: '',
    requestId: String(index),
    principal: { id: 'person', kind: 'person' },
    action: 'read',
    resource: { type: 'project', project: 'p' },
    decision: 'allow',
    rules: [],
    origin,
    snapshot: { grants: ['grant'], roles: ['role'], groups: [], emailMatched: false, resourceAttrs: { type: 'file', project: 'p', path: String(index) } },
  };
}
