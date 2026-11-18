// Checks the feature rules against a candidate module supplied by the mutation runner.
import assert from 'node:assert/strict';
import { createAccessControl } from '../src/server/auth/authorize';
import { requestAccess } from '../src/server/auth/request-scope';
import { accessFixture, person } from '../tests/auth/access-fixture';

const path = 'retail.ontology.yaml';
const project = 'sales-metrics';
const ontology = (status: string, owner = 'carol@example.org', context = 'Use the ID.') => ({
  tessera: 2,
  version: '0.2.0.dev0',
  name: 'Retail',
  ontology: [{ concept: 'Order', type: 'EntityType', tessera_governance: { status, owner, classification: 'public' }, tessera_ai_context: context }],
});

function guards(candidate: Record<string, any>) {
  const options = accessFixture();
  options.config.adminRules = {
    ontology: 'permit(principal is SW::User, action == SW::Action::"approveOntologyItem", resource) when { principal.email == "alice@example.org" && context.level == 0 };',
  };
  const access = createAccessControl(options);
  const actor = (name: 'alice' | 'bob') => candidate.guardFor(access.forRequest(access.principalFor(person(name))));
  const change = (status: string, owner?: string) => ({ project, path, before: JSON.stringify(ontology('proposed', owner)), after: JSON.stringify(ontology(status, owner)) });
  assert.throws(() => actor('bob')([change('approved')]), /Approve ontology item/);
  assert.throws(() => actor('alice')([change('approved', 'ALICE@example.org')]), /they own/);
  assert.equal(actor('alice')([change('approved')]).refused.length, 0);
  const classified = (status: string) => {
    const document = ontology(status);
    Object.assign(document.ontology[0].tessera_governance, { classification: 'internal' });
    return JSON.stringify(document);
  };
  assert.throws(() => actor('alice')([{ project, path, before: classified('proposed'), after: classified('approved') }]), /Approve ontology item/);
}

function itemIdentity(candidate: Record<string, any>) {
  const rules = { levelOf: () => 'public', protectedLevel: 'confidential', levelNumber: (level: string) => Number(level !== 'public') };
  const changes = (before: unknown, after: unknown) => candidate.ontologyItemChanges({ project, file: path }, { before, after, committed: before }, rules);
  const approved = ontology('approved');
  const withoutStatus = structuredClone(approved);
  Object.assign(withoutStatus.ontology[0].tessera_governance, { status: undefined });
  assert.equal(changes(approved, withoutStatus)[0]?.kind, 'item-body');

  const first = { concept: 'Sales.Order', relationships: [{ name: 'code', tessera_governance: { status: 'proposed' } }] };
  const second = { concept: 'Sales', relationships: [{ name: 'Order.code', tessera_governance: { status: 'proposed' } }] };
  const before = { ontology: [first, second] };
  const after = structuredClone(before);
  after.ontology[0].relationships[0].tessera_governance.status = 'approved';
  assert.deepEqual(
    changes(before, after).map((change: { pointer: string }) => change.pointer),
    ['/ontology/0/relationships/0'],
  );
}

async function publication(candidate: Record<string, any>) {
  const published = [{ source: JSON.stringify(ontology('approved')) }];
  const workspace = {
    documentsFor: () => [{ project, source: JSON.stringify(ontology('proposed', undefined, 'UNPUBLISHED')) }],
    published: {
      withPin: async (use: (pin: object) => Promise<Response>) => use({}),
      readableDocuments: async () => ({ commit: 'published', documents: published }),
    },
  };
  const access = createAccessControl(accessFixture());
  const request = Object.assign(new Request('http://localhost'), { [requestAccess]: access.forRequest(access.principalFor(person('bob'))) });
  const response = await candidate.publishedAgentDocuments(workspace, request, project, (documents: unknown) => Response.json(documents));
  assert.deepEqual(await response.json(), published);
  assert.equal(response.headers.get('X-Workbench-Snapshot'), 'published');
}

function demotion(candidate: Record<string, any>) {
  const before = JSON.stringify(ontology('approved'));
  const after = JSON.stringify(ontology('approved', undefined, 'Use a revised ID.'));
  const settings = () => ({ aliases: {}, protectedLevel: 'confidential' });
  const result = candidate.applyGuards([{ project, path, before, after }], settings, () => false, { demote: true });
  assert.equal(result.demoted.length, 1);
  assert.match(result.changes[0].after, /["']?status["']?:\s*["']?proposed/);
}

function counts(candidate: Record<string, any>) {
  const subject = { compiler: { name: 'tessera', version: '1.1.0' }, base: { version: '0.2.0.dev0', label: 'Ossie' }, lossPolicySha256: null, inputs: [], outputs: [], losses: [] };
  const counted = candidate.buildLossReport({ ...subject, governanceStatuses: ['approved', 'approved', 'notSet', 'deprecated', 'proposed'] });
  assert.deepEqual(counted.statusCounts, { approved: 2, deprecated: 1, notSet: 1, proposed: 1 });
  const missing = candidate.buildLossReport(subject);
  assert.equal(missing.statusCounts, undefined);
  assert.notEqual(counted.digest, missing.digest);
}

/** Checks each rule exposed by the candidate, so the same assertions run on the original and mutant. */
export async function attributesMutationCase(candidate: Record<string, any>) {
  if (candidate.isAttribute) {
    const lookup = candidate.conceptKindLookup([{ concept: 'Order', type: 'EntityType' }]);
    const role = { concept: 'String' };
    assert.equal(candidate.isAttribute({ roles: [role] }, lookup), true);
    assert.equal(candidate.isAttribute({ roles: [role, role] }, lookup), false);
    assert.equal(candidate.isAttribute({ roles: [{ concept: 'Order' }] }, lookup), false);
  } else if (candidate.tesseraIssues) {
    const issues = candidate.tesseraIssues({ ...ontology('proposed'), tessera: 1 }).issues;
    assert.ok(issues.some((issue: { code: string }) => issue.code === 'tessera-revision'));
  } else if (candidate.guardFor) {
    guards(candidate);
  } else if (candidate.ontologyItemChanges) {
    itemIdentity(candidate);
  } else if (candidate.applyGuards) {
    demotion(candidate);
  } else if (candidate.publishedAgentDocuments) {
    await publication(candidate);
  } else if (candidate.buildLossReport) {
    counts(candidate);
  } else {
    assert.fail('No attribute or governance case applies to the candidate.');
  }
}
