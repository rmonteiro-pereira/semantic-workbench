// The same unauthorized change to an ontology item is refused on every write path, and the authorized change goes through.
import { expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { GuardedChangeError } from '../../src/server/auth/guards';
import { requestAccess, requestReader } from '../../src/server/auth/request-scope';
import type { GuardOperation } from '../../src/shared/governance/guards';
import { ONTOLOGY_GUARDS_ACTIVE } from '../../src/shared/governance/ontology-guards';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { writeFileSync } from 'node:fs';
import { sha256 } from '../../src/server/projects/atomic';
import { join } from 'node:path';
import { sh } from '../helpers/scm';
import { publishFixture } from '../helpers/published-workspace';
import { authWorkspace } from '../helpers/auth-workspace';
import { accessFixture, person } from '../auth/access-fixture';
import { dataSnapshot, expectGuardRefusal, guardHandler, metricCase, ontologyApprover, openCopyAs, sendCase, type GuardCase } from '../auth/guard-cases';

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
    const allowed = await sendCase(guardHandler(fixture.ws, 'bob', ontologyApprover('bob')), item);
    expect(allowed.status, `${item.name}: ${await allowed.clone().text()}`).toBe(200);
  }
}, 60000);

test('ontology approval and metric approval are independent permissions', async () => {
  using fixture = await authWorkspace();
  const proposed = ontology('proposed');
  const saved = await seed(fixture, proposed);
  const [item] = approvalCases(saved.hash, proposed, ontology('approved'));
  const metric = metricCase(fixture.ws);
  const metricApprover = guardHandler(fixture.ws, 'bob');
  const itemApprover = guardHandler(fixture.ws, 'alice', ontologyApprover('alice'));
  await expectGuardRefusal(await sendCase(metricApprover, item), item, fixture.root);
  await expectGuardRefusal(await sendCase(itemApprover, metric), metric, fixture.root);
  expect((await sendCase(itemApprover, item)).status).toBe(200);
  expect((await sendCase(metricApprover, metric)).status).toBe(200);
});

test('ontology approval uses the classification limit on the role', async () => {
  using fixture = await authWorkspace();
  const proposed = ontology('proposed') + '      classification: internal\n';
  const saved = await seed(fixture, proposed);
  const [item] = approvalCases(saved.hash, proposed, proposed.replace('status: proposed', 'status: approved'));
  const limited = ontologyApprover('alice');
  const role = limited.config.roles.find(candidate => candidate.id === 'r_ontology_approver')!;
  role.permissions[0].conditions = { maxLevel: 'public' };
  await expectGuardRefusal(await sendCase(guardHandler(fixture.ws, 'alice', limited), item), item, fixture.root);
  const authorized = guardHandler(fixture.ws, 'alice', ontologyApprover('alice'));
  expect((await sendCase(authorized, item)).status).toBe(200);
});

test('removing the status of an approved concept needs ontology approval permission', async () => {
  using fixture = await authWorkspace();
  const approved = ontology('approved');
  const saved = await seed(fixture, approved);
  const withoutStatus = approved.replace('      status: approved\n', '');
  const item: GuardCase = {
    name: 'remove approved status',
    method: 'PUT',
    path: `${URL_BASE}/files/${FILE}`,
    body: { baseHash: saved.hash, source: withoutStatus },
    guarded: GUARDED_BODY,
  };
  await refusedThenAllowed(fixture, 'alice', item);
});

test('deleting a file with an approved concept needs an approver', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('approved'));
  const item: GuardCase = { name: 'delete', method: 'DELETE', path: `${URL_BASE}/files/${FILE}`, body: { confirm: true }, guarded: GUARDED_BODY };
  const before = dataSnapshot(fixture.root);
  const body = await expectGuardRefusal(await sendCase(guardHandler(fixture.ws, 'alice'), item), item, fixture.root);
  expect(body.error).toContain('Approve ontology item');
  expect(dataSnapshot(fixture.root)).toEqual(before);
  expect((await sendCase(guardHandler(fixture.ws, 'bob', ontologyApprover('bob')), item)).status).toBe(200);
});

test('moving a file with an approved concept needs an approver', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('approved'));
  const item: GuardCase = { name: 'move', method: 'POST', path: `${URL_BASE}/move`, body: { path: FILE, toProject: 'sales-contracts' }, guarded: GUARDED_BODY };
  const refused = await sendCase(guardHandler(fixture.ws, 'alice'), item);
  const body = await expectGuardRefusal(refused, item, fixture.root);
  expect(body.error).toContain('Approve ontology item');
  expect((await sendCase(guardHandler(fixture.ws, 'bob', ontologyApprover('bob')), item)).status).toBe(200);
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
  const steward = guardHandler(fixture.ws, 'bob', ontologyApprover('bob'));
  const body = await expectGuardRefusal(await sendCase(steward, own), own, fixture.root);
  expect(body.error).toContain('nobody approves or deprecates an item they own');
  const created = await sendCase(steward, create(ontology('approved')));
  expect(created.status, await created.clone().text()).toBe(200);
});

const IDENTITY = ['-c', 'user.name=Ontology author', '-c', 'user.email=author@example.org'];

function scmCase(name: string, body: unknown): GuardCase {
  return { name, method: 'POST', path: `${URL_BASE}/git/${name}`, body, guarded: GUARDED_STATUS };
}

function commitApproval(repository: string) {
  writeFileSync(join(repository, FILE), ontology('approved'));
  sh(repository, [...IDENTITY, 'commit', '-qam', 'Approve Order']);
}

async function refusedThenAllowed(fixture: Awaited<ReturnType<typeof authWorkspace>>, name: 'alice' | 'bob', item: GuardCase) {
  const existing = guardHandler(fixture.ws, name);
  await expectGuardRefusal(await sendCase(existing, item), item, fixture.root);
  const authorized = guardHandler(fixture.ws, name, ontologyApprover(name));
  const response = await sendCase(authorized, item);
  expect(response.status, await response.clone().text()).toBe(200);
  return response;
}

test('reverting a personal edit must pass the ontology approval guard', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('approved'));
  const copy = await openCopyAs(fixture.ws, 'alice', PROJECT);
  const proposed = ontology('proposed');
  writeFileSync(join(copy, FILE), proposed);
  const item = scmCase('revert', { path: FILE, baseHash: sha256(proposed) });
  await refusedThenAllowed(fixture, 'alice', item);
});

test('switching to a branch with an approval needs ontology approval permission', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('proposed'));
  const repository = join(fixture.root, 'projects', PROJECT);
  const current = sh(repository, ['branch', '--show-current']).trim();
  sh(repository, ['switch', '-qc', 'review']);
  commitApproval(repository);
  sh(repository, ['switch', '-q', current]);
  await refusedThenAllowed(fixture, 'alice', scmCase('switch', { branch: 'review' }));
});

test('pulling a commit that approves an item needs ontology approval permission', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('proposed'));
  const repository = join(fixture.root, 'projects', PROJECT);
  const branch = sh(repository, ['branch', '--show-current']).trim();
  const remote = join(fixture.root, 'remote.git');
  const other = join(fixture.root, 'contributor');
  sh(fixture.root, ['clone', '-q', '--bare', repository, remote]);
  sh(fixture.root, ['clone', '-q', remote, other]);
  commitApproval(other);
  sh(other, ['push', '-q', 'origin', branch]);
  await fixture.ws.scm.setRemote(PROJECT, 'origin', remote);
  const response = await refusedThenAllowed(fixture, 'alice', scmCase('pull', {}));
  expect((await response.json()).ok).toBe(true);
});

test('restoring a trashed approval needs ontology approval permission', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('approved'));
  const authorized = guardHandler(fixture.ws, 'alice', ontologyApprover('alice'));
  const deleted = await sendCase(authorized, { name: 'delete', method: 'DELETE', path: `${URL_BASE}/files/${FILE}`, body: { confirm: true }, guarded: GUARDED_BODY });
  expect(deleted.status).toBe(200);
  const { entryId } = await deleted.json();
  await refusedThenAllowed(fixture, 'alice', { name: 'restore', method: 'POST', path: `/api/trash/${entryId}/undo`, body: {}, guarded: GUARDED_STATUS });
});

test('publishing another author’s approval needs ontology approval permission', async () => {
  using fixture = await authWorkspace();
  await seed(fixture, ontology('proposed'));
  await publishFixture(fixture);
  const copy = await openCopyAs(fixture.ws, 'bob', PROJECT);
  commitApproval(copy);
  await refusedThenAllowed(fixture, 'bob', scmCase('publish', {}));
});

const OPERATIONS: GuardOperation[] = ['pull', 'revert', 'delete', 'restore', 'import', 'move', 'switch', 'publish'];

function guardOf(name: 'alice' | 'bob') {
  const access = createAccessControl(name === 'bob' ? ontologyApprover(name) : accessFixture());
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
