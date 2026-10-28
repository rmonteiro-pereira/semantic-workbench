import { LOCAL_READER } from '../../src/server/projects/reader';
import { expect, test } from 'bun:test';
import { authWorkspace } from '../helpers/auth-workspace';
import { accessFixture, boundaryReader, person } from './access-fixture';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

test('drafts are owner-only, including listing, reads, replacement and deletion', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handlers = ['alice', 'frank'].map(name =>
    createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      access,
      publicOrigin: 'http://localhost',
      principal: () => access.principalFor(person(name as 'alice' | 'frank')),
    }),
  );
  const path = '/api/drafts/sales-contracts/orders.odcs.yaml';
  const request = (path: string, method = 'GET', body?: unknown) =>
    new Request('http://localhost' + path, {
      method,
      headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  expect(
    (
      await handlers[0](
        request(path, 'PUT', {
          text: 'LEAK-alice-draft',
          baseHash: null,
        }),
      )
    ).status,
  ).toBe(200);
  expect((await handlers[1](request(path))).status).toBe(404);
  expect(await (await handlers[1](request('/api/drafts'))).json()).toEqual([]);
  await handlers[1](request(path, 'DELETE'));
  expect(await (await handlers[0](request(path))).text()).toContain('LEAK-alice-draft');
});

test('trash hides other owners and restricted original paths from listing and operations', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const alice = access.principalFor(person('alice'));
  const frank = access.principalFor(person('frank'));
  const own = await fixture.ws.trash.deleteFile(
    'sales-contracts',
    'orders.odcs.yaml',
    alice.id,
    LOCAL_READER,
  );
  const other = await fixture.ws.trash.deleteFile(
    'sales-contracts',
    'sales.mapping.yaml',
    frank.id,
    LOCAL_READER,
  );
  const hidden = await fixture.ws.trash.deleteFile(
    'sales-contracts',
    'finance/revenue-recognition.odcs.yaml',
    alice.id,
    LOCAL_READER,
  );
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    access,
    publicOrigin: 'http://localhost',
    principal: () => alice,
  });
  const listing = await handler(new Request('http://localhost/api/trash'));
  const body = await listing.text();
  expect(body).toContain(own.entryId);
  expect(body).not.toContain(other.entryId);
  expect(body).not.toContain(hidden.entryId);
  for (const entry of [other, hidden]) {
    for (const action of ['/undo', '/restore']) {
      const response = await handler(
        new Request('http://localhost/api/trash/' + entry.entryId + action, {
          method: 'POST',
          headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
        }),
      );
      expect(response.status).toBe(404);
    }
  }
});

test('derived data and basic status do not resolve hidden sources or expose server paths', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    access,
    principal: () => principal,
  });
  const context = await handler(
    new Request(
      'http://localhost/api/agent/context?project=sales-contracts&mappingId=sales-contracts/people.mapping.yaml',
    ),
  );
  expect(context.status).toBe(200);
  const body = await context.text();
  expect(body).not.toContain('LEAK-hr');
  expect(body).not.toContain('hr-people/');
  expect(await (await handler(new Request('http://localhost/api/status'))).json()).toEqual({
    mode: 'server',
    ready: true,
    gitAvailable: true,
  });
  const projects = await (await handler(new Request('http://localhost/api/projects'))).json();
  expect(
    projects.find((project: { slug: string }) => project.slug === 'sales-contracts').hiddenFiles,
  ).toBe(1);
});

test('hidden and absent files return identical responses and conflicts hide destinations', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const view = access.view(principal);
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    access,
    principal: () => principal,
  });
  const missing = await handler(
    new Request('http://localhost/api/projects/sales-contracts/files/missing.yaml'),
  );
  const hidden = await handler(
    new Request(
      'http://localhost/api/projects/sales-contracts/files/finance/revenue-recognition.odcs.yaml',
    ),
  );
  expect(missing.status).toBe(404);
  expect(await missing.text()).toBe(await hidden.text());
  await expect(
    fixture.ws.moveFile(
      'sales-contracts',
      'orders.odcs.yaml',
      'sales-contracts',
      'finance/revenue-recognition.odcs.yaml',
      false,
      boundaryReader(view, principal.id),
    ),
  ).rejects.toThrow('The target is unavailable.');
  await expect(
    fixture.ws.importInto(
      'sales-contracts',
      [
        {
          path: 'finance/revenue-recognition.odcs.yaml',
          source: fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml').source,
        },
      ],
      undefined,
      boundaryReader(view, principal.id),
    ),
  ).rejects.toThrow('The target is unavailable.');
  const impact = fixture.ws.deleteImpact(
    'sales-contracts',
    undefined,
    boundaryReader(view, principal.id),
  );
  expect(JSON.stringify(impact)).not.toContain('finance/');
  expect(impact).toHaveProperty('hiddenReferences');
});

test('grouping reads hide restricted document identifiers with a 404', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    access,
    principal: () => principal,
  });
  const id = encodeURIComponent('sales-contracts/finance/revenue-recognition.odcs.yaml');
  const response = await handler(new Request(`http://localhost/api/documents/${id}/grouping`));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Not found.' });
});

test('personal suggestion dismissals do not change another reader’s state', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const alice = access.principalFor(person('alice'));
  const frank = access.principalFor(person('frank'));
  fixture.ws.state.forOwner(alice.id).writeSuggestions([
    {
      hash: 'private-hash',
      target: 'sales-contracts',
      project: 'sales-metrics',
      path: 'sales.semantic.yaml',
      rejectedAt: new Date(0).toISOString(),
    },
  ]);
  expect(fixture.ws.state.forOwner(frank.id).suggestions().rejected).toEqual([]);
  expect(fixture.ws.state.suggestions().rejected).toEqual([]);
});

test('save, move, delete and restore update every personal draft and grouping', async () => {
  using fixture = await authWorkspace();
  const owners = ['alice', 'frank'].map(owner => fixture.ws.state.forOwner(owner));
  const project = 'sales-contracts';
  const path = 'orders.odcs.yaml';
  const file = fixture.ws.readFile(project, path);
  for (const personal of owners) {
    expect('registry' in personal).toBe(false);
    expect('users' in personal).toBe(false);
    personal.writeDraft(project, path, { baseHash: file.hash, text: 'draft', patches: [] });
  }
  await fixture.ws.saveFiles(
    project,
    [{ path, baseHash: file.hash, source: file.source }],
    LOCAL_READER,
  );
  for (const personal of owners) {
    expect(personal.draft(project, path)).toBeNull();
    personal.writeDraft(project, path, { baseHash: file.hash, text: 'draft', patches: [] });
  }
  await fixture.ws.saveFile(
    project,
    path,
    { baseHash: file.hash, source: file.source },
    LOCAL_READER,
  );
  for (const personal of owners) {
    expect(personal.draft(project, path)).toBeNull();
    personal.writeDraft(project, path, { baseHash: file.hash, text: 'draft', patches: [] });
    personal.writeView(project, { [path]: { mode: 'declared' } });
  }
  await fixture.ws.moveFile(project, path, project, 'moved.yaml', false, LOCAL_READER);
  for (const personal of owners) {
    expect(personal.draft(project, path)).toBeNull();
    expect(personal.draft(project, 'moved.yaml')).toMatchObject({ project, path: 'moved.yaml' });
    expect(personal.view(project).files).toEqual({ 'moved.yaml': { mode: 'declared' } });
  }
  const deleted = await fixture.ws.trash.deleteFile(project, 'moved.yaml', 'alice', LOCAL_READER);
  for (const personal of owners) {
    expect(personal.draft(project, 'moved.yaml')).toBeNull();
    expect(personal.view(project).files).toEqual({});
  }
  await fixture.ws.trash.restore(deleted.entryId, { toPath: 'restored.yaml' }, LOCAL_READER);
  for (const personal of owners) {
    expect(personal.draft(project, 'restored.yaml')).toMatchObject({ path: 'restored.yaml' });
    expect(personal.view(project).files).toEqual({ 'restored.yaml': { mode: 'declared' } });
  }
  const deletedProject = await fixture.ws.trash.deleteProject(project, 'alice');
  for (const personal of owners) {
    expect(personal.drafts()).toEqual([]);
    expect(personal.view(project).files).toEqual({});
  }
  await fixture.ws.trash.restore(deletedProject.entryId, {}, LOCAL_READER);
  for (const personal of owners) {
    expect(personal.draft(project, 'restored.yaml')).toMatchObject({ path: 'restored.yaml' });
    expect(personal.view(project).files).toEqual({ 'restored.yaml': { mode: 'declared' } });
  }
});

test('ordinary missing drafts are not audited as unreadable denials', async () => {
  using fixture = await authWorkspace();
  const { createAuditLog } = await import('../../src/server/auth/audit');
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const records: string[] = [];
  const audit = createAuditLog({
    dir: fixture.root + '/audit-check',
    mirror: line => records.push(line),
  });
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    access,
    audit,
    publicOrigin: 'http://localhost',
    principal: () => principal,
  });
  const missing = await handler(
    new Request('http://localhost/api/drafts/sales-contracts/orders.odcs.yaml'),
  );
  expect(missing.status).toBe(404);
  expect(records).toHaveLength(0);
  const missingTrash = await handler(
    new Request('http://localhost/api/trash/missing/restore', {
      method: 'POST',
      headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
      body: '{}',
    }),
  );
  expect(missingTrash.status).toBe(404);
  expect(records).toHaveLength(0);
  const hidden = encodeURIComponent('sales-contracts/finance/revenue-recognition.odcs.yaml');
  expect(
    (await handler(new Request(`http://localhost/api/documents/${hidden}/grouping`))).status,
  ).toBe(404);
  expect(records).toHaveLength(1);
  expect(JSON.parse(records[0])).toMatchObject({ decision: 'deny', reason: 'not-readable' });
});

test('trash visibility evaluates restore policy instead of built-in role names', async () => {
  const { readableTrash } = await import('../../src/server/projects/trash');
  const fixture = accessFixture();
  const access = createAccessControl(fixture);
  const scope = access.forRequest(access.principalFor(person('alice')));
  const entry = {
    project: 'sales-contracts',
    path: 'orders.odcs.yaml',
    deletedBy: scope.principal.id,
  };
  const actions: string[] = [];
  const denyRestore = {
    ...scope,
    authorize: (action: Parameters<typeof scope.authorize>[0]) => {
      actions.push(action);
      return { allow: false, status: 403 as const, rules: [] };
    },
  };
  expect(readableTrash(entry, denyRestore)).toBe(false);
  expect(actions).toEqual(['restoreOwn']);
  const allowRestore = {
    ...scope,
    authorize: (action: Parameters<typeof scope.authorize>[0]) => {
      actions.push(action);
      return { allow: true, status: 200 as const, rules: [] };
    },
  };
  expect(readableTrash({ ...entry, deletedBy: 'another-person' }, allowRestore)).toBe(true);
  expect(actions.at(-1)).toBe('restoreOthers');
});

test('reverting a file clears the shared and every personal draft in its journal', async () => {
  using fixture = await authWorkspace();
  const project = 'sales-contracts';
  const path = 'orders.odcs.yaml';
  const committed = fixture.ws.readFile(project, path);
  const edited = await fixture.ws.saveFile(
    project,
    path,
    {
      baseHash: committed.hash,
      source: committed.source + '\n# edited\n',
    },
    LOCAL_READER,
  );
  const owners = ['alice', 'frank'].map(owner => fixture.ws.state.forOwner(owner));
  for (const personal of [fixture.ws.state, ...owners]) {
    personal.writeDraft(project, path, { baseHash: edited.hash, text: 'draft', patches: [] });
  }
  await fixture.ws.revertFile(project, path, edited.hash, LOCAL_READER);
  expect(fixture.ws.readFile(project, path).hash).toBe(committed.hash);
  for (const personal of [fixture.ws.state, ...owners]) {
    expect(personal.draft(project, path)).toBeNull();
  }
});

test('replacing a file on import clears every personal draft of that file', async () => {
  using fixture = await authWorkspace();
  const project = 'sales-contracts';
  const path = 'orders.odcs.yaml';
  const current = fixture.ws.readFile(project, path);
  const personal = fixture.ws.state.forOwner('alice');
  personal.writeDraft(project, path, { baseHash: current.hash, text: 'draft', patches: [] });
  personal.writeDraft(project, 'sales.mapping.yaml', { baseHash: null, text: 'kept', patches: [] });
  const files = [{ path, source: current.source + '\n# replaced\n' }];
  await fixture.ws.importInto(project, files, 'replace', LOCAL_READER);
  expect(personal.draft(project, path)).toBeNull();
  expect(personal.draft(project, 'sales.mapping.yaml')?.text).toBe('kept');
});

test('a deleted empty project stays visible to the person who may restore it', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const [alice, frank] = (['alice', 'frank'] as const).map(name =>
    access.principalFor(person(name)),
  );
  const project = 'sales-metrics';
  for (const file of fixture.ws.cache.files(project)) {
    await fixture.ws.trash.deleteFile(project, file.path, alice.id, LOCAL_READER);
  }
  const entry = await fixture.ws.trash.deleteProject(project, alice.id);
  const recorded = fixture.ws.trash.list().find(item => item.entryId === entry.entryId);
  expect(recorded?.paths).toEqual([]);
  const listing = async (principal: typeof alice) => {
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      access,
      publicOrigin: 'http://localhost',
      principal: () => principal,
    });
    return (await handler(new Request('http://localhost/api/trash'))).text();
  };
  expect(await listing(alice)).toContain(entry.entryId);
  expect(await listing(frank)).not.toContain(entry.entryId);
});

test('keep-both imports never reveal or replace a name the reader cannot open', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const view = access.view(principal);
  const project = 'sales-contracts';
  const hiddenName = 'orders.odcs (2).yaml';
  const source = fixture.ws.readFile(project, 'orders.odcs.yaml').source;
  await fixture.ws.saveFile(project, hiddenName, { baseHash: null, source }, LOCAL_READER);
  const hiddenHash = fixture.ws.readFile(project, hiddenName).hash;
  const reader = boundaryReader(
    { ...view, canRead: (slug: string, path: string) => path !== hiddenName },
    principal.id,
  );
  const files = [{ path: 'orders.odcs.yaml', source: source + '# imported\n' }];
  const refusal = await fixture.ws
    .importInto(project, files, 'keep-both', reader)
    .catch(error => error);
  expect(refusal.message).toBe('The target is unavailable.');
  expect(JSON.stringify(refusal)).not.toContain('(3)');
  expect(fixture.ws.readFile(project, hiddenName).hash).toBe(hiddenHash);
  expect(fixture.ws.cache.files(project).map(file => file.path)).not.toContain(
    'orders.odcs (3).yaml',
  );
  // A keep-both name skips names already taken by the same batch.
  const batch = [files[0], { path: 'orders.odcs (3).yaml', source }];
  const imported = await fixture.ws.importInto(
    project,
    batch,
    'keep-both',
    boundaryReader(view, principal.id),
  );
  expect(imported.written.map(file => file.path)).toEqual([
    'orders.odcs (4).yaml',
    'orders.odcs (3).yaml',
  ]);
});

test('keep-both moves never reveal or replace a name the reader cannot open', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const view = access.view(principal);
  const project = 'sales-contracts';
  const hiddenName = 'orders.odcs (2).yaml';
  const source = fixture.ws.readFile(project, 'orders.odcs.yaml').source;
  await fixture.ws.saveFile(project, hiddenName, { baseHash: null, source }, LOCAL_READER);
  const hiddenHash = fixture.ws.readFile(project, hiddenName).hash;
  const reader = boundaryReader(
    { ...view, canRead: (slug: string, path: string) => path !== hiddenName },
    principal.id,
  );
  const move = (keepBoth: boolean) =>
    fixture.ws.moveFile(
      'sales-metrics',
      'sales.semantic.yaml',
      project,
      'orders.odcs.yaml',
      keepBoth,
      reader,
    );
  await expect(move(true)).rejects.toThrow('The target is unavailable.');
  const refusal = await move(false).catch(error => error);
  expect(refusal.suggestion).toEqual({});
  expect(JSON.stringify(refusal)).not.toContain('(3)');
  expect(fixture.ws.readFile(project, hiddenName).hash).toBe(hiddenHash);
  expect(fixture.ws.readFile('sales-metrics', 'sales.semantic.yaml').path).toBe(
    'sales.semantic.yaml',
  );
});

test('a move keeps an existing personal draft at the destination, as it does the shared one', async () => {
  using fixture = await authWorkspace();
  const project = 'sales-contracts';
  const personal = fixture.ws.state.forOwner('alice');
  for (const draftState of [fixture.ws.state, personal]) {
    draftState.writeDraft(project, 'orders.odcs.yaml', {
      baseHash: null,
      text: 'source draft',
      patches: [],
    });
    draftState.writeDraft(project, 'moved.yaml', {
      baseHash: null,
      text: 'destination draft',
      patches: [],
    });
  }
  await fixture.ws.moveFile(
    project,
    'orders.odcs.yaml',
    project,
    'moved.yaml',
    false,
    LOCAL_READER,
  );
  for (const draftState of [fixture.ws.state, personal]) {
    expect(draftState.draft(project, 'moved.yaml')?.text).toBe('destination draft');
  }
});

test('local trash requests keep the route message for a missing entry', async () => {
  const { testWorkspace } = await import('../helpers/temp-data-dir');
  using local = await testWorkspace();
  const missing = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const response = await local.handler(
    new Request(`http://localhost/api/trash/${missing}/restore`, {
      method: 'POST',
      body: '{}',
    }),
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Trash entry not found.' });
});

test('grouping and document saves take the reader and hide restricted documents', async () => {
  using fixture = await authWorkspace();
  const { HiddenResourceError } = await import('../../src/server/projects/errors');
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const reader = boundaryReader(access.view(principal), principal.id);
  const hidden = 'sales-contracts/finance/revenue-recognition.odcs.yaml';
  expect(() => fixture.ws.grouping(hidden, reader)).toThrow(HiddenResourceError);
  expect(() => fixture.ws.saveGrouping(hidden, { mode: 'types' }, reader)).toThrow(
    HiddenResourceError,
  );
  await expect(
    fixture.ws.saveDocument('revenue-recognition.odcs.yaml', 'x', reader, hidden, {
      baseHash: '0'.repeat(64),
    }),
  ).rejects.toBeInstanceOf(HiddenResourceError);
  expect(fixture.ws.grouping('sales-contracts/orders.odcs.yaml', reader)).toEqual({});
});

test('workspace modules depend on the access boundary, never on the HTTP middleware', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  for (const name of readdirSync('src/server/projects')) {
    const source = readFileSync(`server/projects/${name}`, 'utf8');
    expect(`${name}: ${source.includes('auth/middleware')}`).toBe(`${name}: false`);
  }
});
