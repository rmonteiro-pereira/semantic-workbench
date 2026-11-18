import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createAuditLog } from '../src/server/auth/audit';
import { mintCaller } from '../src/server/auth/caller';
import { localPrincipal } from '../src/server/auth/principal';
import { CHALLENGE, VERIFIER, RESOURCE, REDIRECT, program, referenceOf, sessionFor, principalNamed } from '../tests/connections/connection-fixture';

/** Deliberate security faults exercised by the connection-only mutation run. */
export const connectionsMutants: [string, string, string, string][] = [
  ['connections-domain', 'src/server/connections/pending-grants.ts', 'stored.spent = true;', 'stored.spent = false;'],
  ['connections-domain', 'src/server/connections/connection-service.ts', "if (!verifier) return refuse('verifier-mismatch');", ''],
  ['connections-domain', 'src/server/connections/authorization-request.ts', 'program.redirectUris.includes(redirectUri)', 'program.redirectUris.some(value => redirectUri.startsWith(value))'],
  ['connections-domain', 'src/server/connections/connection-service.ts', 'trade.resource === binding.resource', 'true'],
  ['connections-domain', 'src/server/connections/connection-service.ts', 'trade.clientId === binding.clientId', 'true'],
  ['connections-domain', 'src/server/connections/connection-service.ts', "if (retired) end(retired.id, 'replay');", ''],
  ['connections-domain', 'src/server/connections/connection-service.ts', "if (!session) return 'session-ended';", 'if (!session) return null;'],
  ['connections-domain', 'src/server/connections/connection-service.ts', 'scope: effectsOf(record.scopes)', 'scope: undefined'],
  ['connections-domain', 'src/server/connections/connection-service.ts', 'accessTokenLive(record, now())', 'true'],
  [
    'connections-gate',
    'src/server/mcp/server-mode-gate.ts',
    "if (!match) return { allow: false, status: 401, reason: 'credential' };",
    "if (!match) return { allow: true, caller: {} as Caller, connection: 'cookie' };",
  ],
  ['connections-receipts', 'src/server/mcp/receipts.ts', '(found?.principalId === request.principalId && found.connectionId === request.connectionId)', 'found'],
  ['connections-receipts', 'src/server/mcp/receipts.ts', 'if (refusal) return refusal;', ''],
];

async function verifyReceipts(path: string) {
  const { createReceiptStore } = await import(path);
  const root = mkdtempSync(join(tmpdir(), 'receipt-mutant-'));
  try {
    const store = createReceiptStore(root);
    let denied = false;
    let effects = 0;
    const request = {
      principalId: 'person',
      connectionId: 'connection',
      tool: 'git_commit',
      idempotencyKey: 'receipt-verification',
      args: {},
      effect: async () => ({ ok: true, data: { attempt: ++effects } }),
      authorizeReplay: async () => (denied ? { ok: false, error: { code: 'refused', message: 'Refused' } } : undefined),
      verify: async () => null,
    };
    assert.equal((await store.run(request)).ok, true);
    assert.equal((await store.run(request)).data.attempt, 1);
    denied = true;
    assert.equal((await store.run(request)).ok, false);
    denied = false;
    const file = join(root, readdirSync(root)[0]);
    const records = JSON.parse(readFileSync(file, 'utf8'));
    const id = Object.keys(records)[0];
    records[id].connectionId = 'another-connection';
    writeFileSync(file, JSON.stringify(records));
    assert.equal((await store.run(request)).data.attempt, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Exercises the composed candidate modules through grants, exchanges, resolution and transport admission. */
export async function connectionsCase(path: string, category: string): Promise<void> {
  if (category === 'connections-receipts') return verifyReceipts(path);
  const tree = dirname(path);
  if (category === 'connections-gate') {
    const { decideServerRequest } = await import(join(tree, 'server-mode-gate.ts'));
    const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp', connection: 'connection' });
    const service = { resolve: async () => ({ ok: true, caller, connection: 'connection' }) };
    const response = await decideServerRequest({ method: 'POST', origin: null, host: null, contentType: 'application/json', authorization: null, cookie: 'signed-in-person' }, service);
    assert.equal(response.allow, false);
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'connection-mutant-'));
  try {
    const { createConnectionService } = await import(join(tree, 'connection-service.ts'));
    const { createPendingGrants } = await import(join(tree, 'pending-grants.ts'));
    const { openConnectionStore } = await import(join(tree, 'connection-store.ts'));
    const { parseAuthorizationRequest } = await import(join(tree, 'authorization-request.ts'));
    let now = 1000;
    const session = sessionFor('session', principalNamed('alice'));
    let live = true;
    const key = new Uint8Array(32).fill(9);
    const grants = createPendingGrants({ key, now: () => now });
    const store = openConnectionStore(join(root, 'connections'));
    const service = createConnectionService({
      store,
      grants,
      key,
      sessions: { getByReference: async (reference: string) => (live && reference === referenceOf(session.id) ? session : null), onEnded: () => () => {} },
      principalFor: (principal: unknown) => principal,
      programs: () => ({ formatVersion: 1, programs: [program] }),
      resource: RESOURCE,
      audit: createAuditLog({ dir: join(root, 'audit') }),
      now: () => now,
    });
    const issue = () =>
      grants.issue({
        kind: 'code',
        clientId: program.clientId,
        redirectUri: REDIRECT,
        scopes: ['read'],
        resource: RESOURCE,
        codeChallenge: CHALLENGE,
        person: session.principal.id,
        sessionReference: referenceOf(session.id),
        origin: 'mcp',
      }).value;
    const trade = (code: string, change = {}) => service.issueFromCode({ code, clientId: program.clientId, redirectUri: REDIRECT, resource: RESOURCE, codeVerifier: VERIFIER, ...change });
    for (const change of [{ codeVerifier: 'x'.repeat(43) }, { resource: RESOURCE + '/other' }, { clientId: 'other-client' }]) assert.equal((await trade(issue(), change)).ok, false);
    const code = issue();
    const issued = await trade(code);
    assert.equal(issued.ok, true);
    const resolved = await service.resolve(issued.tokens.accessToken);
    assert.deepEqual(resolved.caller.scope, ['read']);
    await trade(code);
    assert.equal((await service.resolve(issued.tokens.accessToken)).ok, false);
    const refreshed = await trade(issue());
    const rotated = await service.refresh({ refreshToken: refreshed.tokens.refreshToken, clientId: program.clientId, resource: RESOURCE });
    assert.equal(rotated.ok, true);
    await service.refresh({ refreshToken: refreshed.tokens.refreshToken, clientId: program.clientId, resource: RESOURCE });
    assert.equal((await service.resolve(rotated.tokens.accessToken)).ok, false);
    const expired = await trade(issue());
    now += 600000;
    assert.equal((await service.resolve(expired.tokens.accessToken)).ok, false);
    live = false;
    assert.equal((await service.refresh({ refreshToken: expired.tokens.refreshToken, clientId: program.clientId, resource: RESOURCE })).ok, false);
    const query = new URLSearchParams({
      client_id: program.clientId,
      redirect_uri: REDIRECT + '/attacker',
      response_type: 'code',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      resource: RESOURCE,
      scope: 'read',
    });
    assert.equal(parseAuthorizationRequest(query, { formatVersion: 1, programs: [program] }, RESOURCE).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
