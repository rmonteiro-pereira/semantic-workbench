// The same unauthorized change to an ontology item is refused on every write path, and the authorized change goes through.
import { expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { GuardedChangeError } from '../../src/server/auth/guards';
import { requestAccess, requestReader } from '../../src/server/auth/request-scope';
import type { GuardOperation } from '../../src/shared/governance/guards';
import { ONTOLOGY_GUARDS_ACTIVE } from '../../src/shared/governance/ontology-guards';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { join } from 'node:path';
import { sh } from '../helpers/scm';
import { authWorkspace } from '../helpers/auth-workspace';
import { accessFixture, person } from '../auth/access-fixture';
import { dataSnapshot, expectGuardRefusal, guardHandler, sendCase, type GuardCase } from '../auth/guard-cases';

const PROJECT = 'sales-metrics';
const FILE = 'retail.ontology.yaml';
const URL_BASE = `/api/projects/${PROJECT}`;

/** Saves the ontology and commits it, so every person's working copy starts with it. */
async function seed(fixture: Awaited<ReturnType<typeof authWorkspace>>, source: string) {
  const saved = await fixture.ws.saveFile(PROJECT, FILE, { baseHash: null, source }, LOCAL_READER);
  const repository = join(fixture.root, 'projects', PROJECT);
  sh(repository, ['add', FILE]);
  sh(repository, ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.org', 'commit', '-q', '-m', 'Add the retail ontology']);
  return saved;
}

function ontology(status: string, owner = 'carol@example.org'): string {
  return `tessera: 2\nversion: 0.2.0.dev0\nname: Retail\nontology:\n  - concept: Order\n    type: EntityType\n    description: A customer order.\n    tessera_governance:\n      status: ${status}\n      owner: ${owner}\n`;
}

const GUARDED_STATUS = { file: FILE, pointer: '/ontology/0', kind: 'item-status' };
const GUARDED_BODY = { file: FILE, pointer: '/ontology/0', kind: 'item-body' };

/** The case the matrix sends: approving a concept the file holds as proposed. */
function approvalCases(baseHash: string, proposed: string, approved: string): GuardCase[] {
  const offset = proposed.indexOf('proposed');
  const patch = { from: offset, to: offset + 'proposed'.length, insert: 'approved' };
  const guarded = GUARDED_STATUS;
  return [
    { name: 'Source save', method: 'PUT', path: `${URL_BASE}/files/${FILE}`, body: { baseHash, source: approved }, guarded },
    { name: 'item edit', method: 'PUT', path: `${URL_BASE}/files/${FILE}`, body: { baseHash, patches: [patch] }, guarded },
    { name: 'save-batch', method: 'POST', path: `${URL_BASE}/save-batch`, body: { files: [{ path: FILE, baseHash, source: approved }] }, guarded },
    { name: 'legacy document save', method: 'POST', path: '/api/documents', body: { id: `${PROJECT}/${FILE}`, filename: FILE, source: approved, baseHash }, guarded },
    { name: 'import with replace', method: 'POST', path: `${URL_BASE}/import`, body: { files: [{ path: FILE, source: approved }], onConflict: 'replace' }, guarded },
  ];
}

test('an Editor is refused approving a concept on every save path and a Steward is not', async () => {
  for (const index of [0, 1, 2, 3, 4]) {
    using fixture = await authWorkspace();
    const proposed = ontology('proposed');
    const approved = ontology('approved');
    const saved = await seed(fixture, proposed);
    const item = approvalCases(saved.hash, proposed, approved)[index];
    const before = dataSnapshot(fixture.root);
    await expectGuardRefusal(await sendCase(guardHandler(fixture.ws, 'alice'), item), item, fixture.root);
    expect(dataSnapshot(fixture.root), item.name).toEqual(before);
    const allowed = await sendCase(guardHandler(fixture.ws, 'bob'), item);
    expect(allowed.status, `${item.name}: ${await allowed.clone().text()}`).toBe(200);
  }
}, 60000);

test('deleting a file with an approved concept needs an approver', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('approved'));
  const item: GuardCase = { name: 'delete', method: 'DELETE', path: `${URL_BASE}/files/${FILE}`, body: { confirm: true }, guarded: GUARDED_BODY };
  const before = dataSnapshot(fixture.root);
  const body = await expectGuardRefusal(await sendCase(guardHandler(fixture.ws, 'alice'), item), item, fixture.root);
  expect(body.error).toContain('to delete this file');
  expect(dataSnapshot(fixture.root)).toEqual(before);
  expect((await sendCase(guardHandler(fixture.ws, 'bob'), item)).status).toBe(200);
});

test('moving a file with an approved concept needs an approver', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('approved'));
  const item: GuardCase = { name: 'move', method: 'POST', path: `${URL_BASE}/move`, body: { path: FILE, toProject: 'sales-contracts' }, guarded: GUARDED_BODY };
  const refused = await sendCase(guardHandler(fixture.ws, 'alice'), item);
  const body = await expectGuardRefusal(refused, item, fixture.root);
  expect(body.error).toContain('to move this file');
  expect((await sendCase(guardHandler(fixture.ws, 'bob'), item)).status).toBe(200);
});

test('an import that creates a project is judged as creating its files', async () => {
  using fixture = await authWorkspace();
  const create = (source: string): GuardCase => ({
    name: 'new-project import',
    method: 'POST',
    path: '/api/import',
    body: { name: 'Imported ontology', domain: 'sales', files: [{ path: FILE, source }] },
    guarded: GUARDED_STATUS,
  });
  const own = create(ontology('approved', 'bob@example.org'));
  const steward = guardHandler(fixture.ws, 'bob');
  const body = await expectGuardRefusal(await sendCase(steward, own), own, fixture.root);
  expect(body.error).toContain('nobody approves or deprecates an item they own');
  const created = await sendCase(steward, create(ontology('approved')));
  expect(created.status, await created.clone().text()).toBe(200);
});

const OPERATIONS: GuardOperation[] = ['pull', 'revert', 'delete', 'restore', 'import', 'move', 'switch', 'publish'];

function guardOf(name: 'alice' | 'bob') {
  const access = createAccessControl(accessFixture());
  const request = new Request('http://localhost/api');
  Object.assign(request, { [requestAccess]: access.forRequest(access.principalFor(person(name))) });
  return requestReader(request).guard!;
}

test('every operation that brings text in refuses the approval for an Editor and names who may do it', () => {
  const change = { project: PROJECT, path: FILE, before: ontology('proposed'), after: ontology('approved') };
  for (const operation of OPERATIONS) {
    let refusal: unknown;
    try {
      guardOf('alice')([change], { operation });
    } catch (error) {
      refusal = error;
    }
    expect(refusal, operation).toBeInstanceOf(GuardedChangeError);
    expect((refusal as GuardedChangeError).guarded[0].kind, operation).toBe('item-status');
    expect(() => guardOf('bob')([change], { operation }), operation).not.toThrow();
  }
});

test('a refusal for a file the person cannot read names neither the item nor its kind', () => {
  const change = { project: 'hr-people', path: 'secret.ontology.yaml', before: ontology('proposed'), after: ontology('approved') };
  let message = '';
  try {
    guardOf('alice')([change]);
  } catch (error) {
    message = (error as GuardedChangeError).message;
    expect((error as GuardedChangeError).guarded).toEqual([]);
  }
  expect(message).toContain('guarded change');
  expect(message).not.toContain('Order');
  expect(message).not.toContain('approving');
  expect(message).not.toContain('concept');
});

test('the editor flag is on only when the cases above hold', () => {
  expect(ONTOLOGY_GUARDS_ACTIVE).toBe(true);
});
