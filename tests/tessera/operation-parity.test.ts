// Checks the save operations give the same result over HTTP and through the operation boundary for a valid and an invalid Tessera document.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { operationById } from '../../src/server/auth/operation-inventory';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from '../auth/access-fixture';

const origin = 'http://localhost:5312';
const project = 'sales-contracts';
const newFile = 'retail.ontology.yaml';
const VALID = readFileSync('tests/fixtures/tessera/documents/notes-everywhere.yaml', 'utf8');
const INVALID = VALID.replace('tessera_notes: Ask finance', 'tessera_note: Ask finance');

type Save = { id: string; body: (source: string) => unknown };
const saves: Save[] = [
  { id: 'files.save', body: source => ({ baseHash: null, source }) },
  { id: 'files.saveBatch', body: source => ({ files: [{ path: newFile, baseHash: null, source }] }) },
  { id: 'documents.save', body: source => ({ filename: newFile, source }) },
];

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (typeof value === 'string') return value.replace(/\b[0-9a-f]{40,64}\b/g, '<hash>').replace(/[0-9A-HJKMNP-TV-Z]{26}/g, '<entry>');
  if (!value || typeof value !== 'object') return value;
  const volatile = ['at', 'prev', 'updated', 'indexedAt', 'requestId', 'createdAt', 'updatedAt', 'origin', 'tool', 'connection', 'op'];
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !volatile.includes(key))
      .map(([key, item]) => [key, normalized(item)]),
  );
}

function requestFor(save: Save, source: string) {
  const template = operationById(save.id)!.row.split(' ').slice(1).join(' ');
  const params: Record<string, string> = {};
  for (const match of template.matchAll(/:([a-z]+)|\*/g)) params[match[1] ?? '*'] = (match[1] ?? '*') === 'slug' ? project : newFile;
  return buildTwinRequest(save.id, { params, body: save.body(source) });
}

async function run(save: Save, source: string, twin: boolean) {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('dave'));
  const audit = createAuditLog({ dir: join(fixture.root, 'parity-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: origin, port: 5312, remoteCredentials: allowEveryRemote() });
  const request = requestFor(save, source);
  const response = twin
    ? (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request })).response
    : await handler(
        new Request(origin + new URL(request.url).pathname, {
          method: request.method,
          body: await request.text(),
          headers: { ...Object.fromEntries(request.headers), Origin: origin, 'X-SW-Request': '1' },
        }),
      );
  const payload = await response.json().catch(() => null);
  return { status: response.status, body: normalized(payload), audit: audit.recent(10).map(normalized) };
}

for (const save of saves) {
  test(`${save.id} gives HTTP and the boundary the same result for a valid Tessera document`, async () => {
    const http = await run(save, VALID, false);
    const twin = await run(save, VALID, true);
    expect(http.status).toBe(200);
    expect(twin).toEqual(http);
  }, 60000);

  test(`${save.id} gives HTTP and the boundary the same refusal for an invalid Tessera document`, async () => {
    const http = await run(save, INVALID, false);
    const twin = await run(save, INVALID, true);
    expect(http.status).toBe(400);
    expect(JSON.stringify(http.body)).toContain('tessera-property');
    expect(twin).toEqual(http);
  }, 60000);
}
