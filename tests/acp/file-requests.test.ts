// File requests of the agent go through the operation boundary: accepted, stale, unread, create, create race, invalid, hidden, draft kept and repeat.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { createFileRequests, MAXIMUM_FILE_TEXT_BYTES } from '../../src/server/acp/file-requests';
import { mintAcpCaller } from '../../src/server/acp/connection-auth';
import { createVersionRecords } from '../../src/server/acp/version-records';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from '../auth/access-fixture';

const ORDERS = '/workbench/sales-contracts/orders.odcs.yaml';
const origin = 'http://localhost:5312';

async function setup(user: 'dave' | 'alice' | 'carol' = 'dave', options: { admit?: () => { ok: true; release(): void } | { ok: false }; before?: (request: Request) => Promise<void> } = {}) {
  const fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person(user));
  const audit = createAuditLog({ dir: join(fixture.root, 'panel-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: origin, port: 5312, remoteCredentials: allowEveryRemote() });
  const caller = mintAcpCaller({ principal, connection: 'acp-test', scope: ['read', 'localWrite'] });
  const versions = createVersionRecords();
  const requests = createFileRequests({
    operate: async request => {
      await options.before?.(request);
      return (await handler.boundary.operate({ caller, request })).response;
    },
    versions,
    admit: options.admit ?? (() => ({ ok: true, release() {} })),
  });
  const browser = (path: string, init: RequestInit = {}) => handler(new Request(origin + path, { ...init, headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' } }));
  // Saves land in the person's own working copy in server mode, so the stored text is read back through the same route a person uses.
  const stored = async (path: string) => ((await (await browser(`/api/projects/sales-contracts/files/${path}`)).json()) as { source: string }).source;
  const disk = (path: string) => readFileSync(join(fixture.root, 'projects', 'sales-contracts', path), 'utf8');
  return { fixture, requests, audit, versions, browser, disk, stored };
}

test('a read returns the text and a line window and remembers the version', async () => {
  const { fixture, requests, versions, disk } = await setup();
  using _fixture = fixture;
  const whole = await requests.read({ path: ORDERS });
  expect(whole).toEqual({ ok: true, content: disk('orders.odcs.yaml') });
  const windowed = await requests.read({ path: ORDERS, line: 2, limit: 2 });
  expect(windowed).toEqual({ ok: true, content: disk('orders.odcs.yaml').split('\n').slice(1, 3).join('\n') + '\n' });
  expect(versions.get('sales-contracts', 'orders.odcs.yaml')).toMatch(/^[0-9a-f]{64}$/);
});

test('a write after a read is saved, shown as a change and audited once with origin acp', async () => {
  const { fixture, requests, audit, disk, stored } = await setup();
  using _fixture = fixture;
  const original = disk('orders.odcs.yaml');
  await requests.read({ path: ORDERS });
  const edited = original.replace('Sales orders contract', 'Sales orders contract changed');
  const outcome = await requests.write({ path: ORDERS, content: edited });
  expect(outcome.ok).toBe(true);
  expect(await stored('orders.odcs.yaml')).toBe(edited);
  const card = outcome.ok ? outcome.card : undefined;
  expect(card).toMatchObject({ outcome: 'accepted', path: ORDERS, before: original, after: edited });
  const saves = audit.recent(20).filter(entry => entry.tool === 'files.save');
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({ origin: 'acp', connection: 'acp-test', decision: 'allow' });
});

test('a write of a file never read is refused and the file is untouched', async () => {
  const { fixture, requests, disk, stored } = await setup();
  using _fixture = fixture;
  const original = disk('orders.odcs.yaml');
  const outcome = await requests.write({ path: ORDERS, content: original + '# x\n' });
  expect(outcome).toMatchObject({ ok: false, failure: { reason: 'unread', card: { outcome: 'refused', reason: 'unread' } } });
  expect(await stored('orders.odcs.yaml')).toBe(original);
});

test('a write after the file changed is refused as changed', async () => {
  const { fixture, requests, browser, disk, stored } = await setup();
  using _fixture = fixture;
  const original = disk('orders.odcs.yaml');
  await requests.read({ path: ORDERS });
  const current = (await (await browser('/api/projects/sales-contracts/files/orders.odcs.yaml')).json()) as { hash: string };
  const changed = original + '# by a person\n';
  expect((await browser('/api/projects/sales-contracts/files/orders.odcs.yaml', { method: 'PUT', body: JSON.stringify({ baseHash: current.hash, source: changed }) })).status).toBe(200);
  const outcome = await requests.write({ path: ORDERS, content: original + '# by the agent\n' });
  expect(outcome).toMatchObject({ ok: false, failure: { reason: 'changed' } });
  expect(await stored('orders.odcs.yaml')).toBe(changed);
});

test('a new file is created without a read and the second write of it needs the version it was given', async () => {
  const { fixture, requests, disk, stored } = await setup();
  using _fixture = fixture;
  const path = '/workbench/sales-contracts/created.odcs.yaml';
  const text = disk('orders.odcs.yaml').replace('id: 1b0c6a52-3f0e-4c55-9d0e-6a1f2b3c4d01', 'id: 1b0c6a52-3f0e-4c55-9d0e-6a1f2b3c4d77');
  const created = await requests.write({ path, content: text });
  expect(created).toMatchObject({ ok: true, card: { outcome: 'accepted', before: '', after: text } });
  expect(await stored('created.odcs.yaml')).toBe(text);
  const again = await requests.write({ path, content: text + '# more\n' });
  expect(again.ok).toBe(true);
});

test('creating a file that appears between the check and the save is refused as changed', async () => {
  let injected = false;
  const holder: { browser?: (path: string, init?: RequestInit) => Promise<Response> } = {};
  const { fixture, requests, browser, disk, stored } = await setup('dave', {
    before: async request => {
      const isTheSave = request.method === 'PUT' && request.url.includes('raced.odcs.yaml');
      if (injected || !isTheSave) return;
      injected = true;
      const person = await holder.browser!('/api/projects/sales-contracts/files/raced.odcs.yaml', {
        method: 'PUT',
        body: JSON.stringify({ baseHash: null, source: disk('orders.odcs.yaml').replace('4d01', '4d55') }),
      });
      expect(person.status).toBe(200);
    },
  });
  using _fixture = fixture;
  holder.browser = browser;
  const text = disk('orders.odcs.yaml').replace('4d01', '4d66');
  const outcome = await requests.write({ path: '/workbench/sales-contracts/raced.odcs.yaml', content: text });
  expect(outcome).toMatchObject({ ok: false, failure: { reason: 'changed' } });
  expect(await stored('raced.odcs.yaml')).toContain('4d55');
});

test('invalid text is refused with its findings and nothing is written', async () => {
  const { fixture, requests, disk, stored } = await setup();
  using _fixture = fixture;
  const original = disk('orders.odcs.yaml');
  await requests.read({ path: ORDERS });
  const outcome = await requests.write({ path: ORDERS, content: 'ontology: [' });
  expect(outcome).toMatchObject({ ok: false, failure: { reason: 'invalid', card: { outcome: 'refused', reason: 'invalid' } } });
  expect(outcome.ok === false && (outcome.failure.card?.findings?.length ?? 0)).toBeGreaterThan(0);
  expect(await stored('orders.odcs.yaml')).toBe(original);
});

test('a hidden file answers as a missing one for reads and writes', async () => {
  const { fixture, requests } = await setup('alice');
  using _fixture = fixture;
  const hidden = '/workbench/hr-people/people.odcs.yaml';
  const missing = '/workbench/hr-people/nothing.odcs.yaml';
  const readHidden = await requests.read({ path: hidden });
  const readMissing = await requests.read({ path: missing });
  expect(readHidden).toEqual(readMissing);
  const writeHidden = await requests.write({ path: hidden, content: 'x: 1\n' });
  const writeMissing = await requests.write({ path: missing, content: 'x: 1\n' });
  expect(writeHidden).toMatchObject({ ok: false, failure: { reason: 'not-available' } });
  expect(writeMissing).toMatchObject({ ok: false, failure: { reason: 'not-available' } });
});

test('a person without the edit right cannot write even after reading', async () => {
  const { fixture, requests, disk, stored } = await setup('carol');
  using _fixture = fixture;
  const original = disk('orders.odcs.yaml');
  const read = await requests.read({ path: ORDERS });
  if (!read.ok) return;
  const outcome = await requests.write({ path: ORDERS, content: original + '# x\n' });
  expect(outcome.ok).toBe(false);
  expect(await stored('orders.odcs.yaml')).toBe(original);
});

test("the person's unsaved draft stays when the agent saves the same file", async () => {
  const { fixture, requests, browser, disk } = await setup();
  using _fixture = fixture;
  const original = disk('orders.odcs.yaml');
  await requests.read({ path: ORDERS });
  const current = (await (await browser('/api/projects/sales-contracts/files/orders.odcs.yaml')).json()) as { hash: string };
  const draft = await browser('/api/drafts/sales-contracts/orders.odcs.yaml', { method: 'PUT', body: JSON.stringify({ baseHash: current.hash, text: original + '# unsaved\n' }) });
  expect(draft.status).toBe(200);
  expect((await requests.write({ path: ORDERS, content: original + '# agent\n' })).ok).toBe(true);
  const kept = await browser('/api/drafts/sales-contracts/orders.odcs.yaml');
  expect(kept.status).toBe(200);
  expect(((await kept.json()) as { text: string }).text).toContain('# unsaved');
});

test('repeating a write already applied is answered as applied with no card and no second save record', async () => {
  const { fixture, requests, audit, disk } = await setup();
  using _fixture = fixture;
  await requests.read({ path: ORDERS });
  const edited = disk('orders.odcs.yaml').replace('Sales orders contract', 'Sales orders contract repeat');
  const first = await requests.write({ path: ORDERS, content: edited });
  const second = await requests.write({ path: ORDERS, content: edited });
  expect(first.ok && first.card).toBeTruthy();
  expect(second).toEqual({ ok: true });
  expect(audit.recent(50).filter(entry => entry.tool === 'files.save')).toHaveLength(1);
});

test('text over the size limit is refused before any operation runs', async () => {
  const { fixture, requests, audit } = await setup();
  using _fixture = fixture;
  const outcome = await requests.write({ path: ORDERS, content: 'x'.repeat(MAXIMUM_FILE_TEXT_BYTES + 1) });
  expect(outcome).toMatchObject({ ok: false, failure: { reason: 'too-large' } });
  expect(audit.recent(10)).toHaveLength(0);
});

test('hostile paths and a refused call limit never reach the boundary', async () => {
  const limited = await setup('dave', { admit: () => ({ ok: false }) });
  using _limited = limited.fixture;
  expect(await limited.requests.read({ path: ORDERS })).toMatchObject({ ok: false, failure: { reason: 'rate-limited' } });
  expect(await limited.requests.write({ path: ORDERS, content: 'x' })).toMatchObject({ ok: false, failure: { reason: 'rate-limited' } });
  const open = await setup();
  using _open = open.fixture;
  for (const path of ['/etc/passwd', '/workbench/sales-contracts/../hr-people/people.odcs.yaml', '/workbench/sales-contracts/%2e%2e/x', 'orders.odcs.yaml', 42]) {
    expect(await open.requests.read({ path })).toMatchObject({ ok: false, failure: { reason: 'not-available' } });
    expect(await open.requests.write({ path, content: 'x' })).toMatchObject({ ok: false, failure: { reason: 'not-available' } });
  }
  expect(open.audit.recent(10)).toHaveLength(0);
});
