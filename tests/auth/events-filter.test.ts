import { expect, test } from 'bun:test';
import { createEvents } from '../../server/projects/events';
import { createAccessControl } from '../../server/auth/authorize';
import { accessFixture, person } from './access-fixture';
// Events that carry no suggestion counting; the stubs keep a count round cheap.
const noSuggestions = { suggestionIndex: () => [], sharedSuggestionCount: () => 0 };

test('live and replayed events hide unreadable projects', async () => {
  const events = createEvents(noSuggestions);
  const access = createAccessControl(accessFixture());
  const scope = access.forRequest(access.principalFor(person('alice')));
  const request = new Request('http://localhost/api/events', { headers: { 'Last-Event-ID': '0' } });
  events.emit(
    'files',
    { project: 'hr-people', paths: ['LEAK-secret.yaml'] },
    { paths: [{ project: 'hr-people', path: 'LEAK-secret.yaml' }] },
  );
  events.emit(
    'files',
    { project: 'sales-contracts', paths: ['orders.odcs.yaml'] },
    { paths: [{ project: 'sales-contracts', path: 'orders.odcs.yaml' }] },
  );
  const response = events.stream(request, undefined, {
    scope,
    owner: scope.principal.id,
  });
  const reader = response.body!.getReader();
  await reader.read();
  const replay = new TextDecoder().decode((await reader.read()).value);
  expect(replay).not.toContain('hr-people');
  expect(replay).toContain('sales-contracts');
  events.emit(
    'files',
    { project: 'hr-people', paths: ['LEAK-secret.yaml'] },
    { paths: [{ project: 'hr-people', path: 'LEAK-secret.yaml' }] },
  );
  events.emit(
    'files',
    { project: 'sales-contracts', paths: ['orders.odcs.yaml'] },
    { paths: [{ project: 'sales-contracts', path: 'orders.odcs.yaml' }] },
  );
  const live = new TextDecoder().decode((await reader.read()).value);
  expect(live).not.toContain('LEAK-');
  expect(live).toContain('sales-contracts');
  await reader.cancel();
});

test('multi-item events reduce paths and suggestions use the receiving count', async () => {
  const { readableEvent } = await import('../../server/projects/event-access');
  const access = createAccessControl(accessFixture());
  const scope = access.forRequest(access.principalFor(person('alice')));
  const receiver = { scope, owner: scope.principal.id, suggestions: () => 2 };
  const event = readableEvent(
    {
      id: 1,
      event: 'files',
      tags: {
        paths: [
          { project: 'sales-contracts', path: 'orders.odcs.yaml' },
          { project: 'sales-contracts', path: 'finance/removed.yaml' },
        ],
      },
      data: {
        project: 'sales-contracts',
        changed: ['orders.odcs.yaml', 'finance/removed.yaml'],
        removed: [],
      },
    },
    receiver,
  );
  expect(JSON.stringify(event)).not.toContain('finance/');
  const events = createEvents(noSuggestions);
  const response = events.stream(new Request('http://localhost/events'), undefined, receiver);
  const stream = response.body!.getReader();
  await stream.read();
  const frame = new TextDecoder().decode((await stream.read()).value);
  expect(JSON.parse(frame.split('data: ')[1])).toEqual({ open: 2 });
  await stream.cancel();
  expect(
    readableEvent(
      {
        id: 3,
        event: 'files',
        tags: { audience: 'all', owner: 'someone-else' },
        data: {
          project: 'sales-contracts',
          owner: 'someone-else',
          changed: ['orders.odcs.yaml'],
        },
      },
      receiver,
    ),
  ).toBeNull();
});

test('grant changes send access and close the stream', async () => {
  const access = createAccessControl(accessFixture());
  const events = createEvents(noSuggestions);
  const response = events.stream(
    new Request('http://localhost/events'),
    undefined,
    undefined,
    access.subscribe,
  );
  const reader = response.body!.getReader();
  await reader.read();
  access.reload(accessFixture().config);
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"reason":"changed"');
  expect((await reader.read()).done).toBe(true);
  expect(events.clientCount).toBe(0);
});

test('tagged multi-path events retain their readable items', async () => {
  const { readableEvent } = await import('../../server/projects/event-access');
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const event = readableEvent(
    {
      id: 1,
      event: 'files',
      data: {
        project: 'sales-contracts',
        changed: ['orders.odcs.yaml', 'finance/removed.yaml'],
      },
      tags: {
        projects: ['sales-contracts'],
        paths: [
          { project: 'sales-contracts', path: 'orders.odcs.yaml' },
          { project: 'sales-contracts', path: 'finance/removed.yaml' },
        ],
      },
    },
    { scope: access.forRequest(principal), owner: principal.id },
  );
  expect(event?.data).toEqual({ project: 'sales-contracts', changed: ['orders.odcs.yaml'] });
  expect(JSON.stringify(event)).not.toContain('finance/');
});

test('Git invalidations with no named paths still reach readers and omit repository counts', async () => {
  const { readableEvent } = await import('../../server/projects/event-access');
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const receiver = { scope: access.forRequest(principal), owner: principal.id };
  const event = {
    id: 1,
    event: 'git',
    tags: { projects: ['sales-contracts'] },
    data: { project: 'sales-contracts', altered: [], changes: 99 },
  };
  expect(readableEvent(event, receiver)?.data).toEqual({
    project: 'sales-contracts',
    altered: [],
  });
  expect(
    readableEvent({ ...event, tags: { ...event.tags, copy: 'another-copy' } }, receiver),
  ).toBeNull();
});

test('a connected scope sees newly registered projects', async () => {
  const fixture = accessFixture();
  const projects = [...fixture.knownProjects()];
  const access = createAccessControl({ ...fixture, knownProjects: () => projects });
  const scope = access.forRequest(access.principalFor(person('dave')));
  const { readableEvent } = await import('../../server/projects/event-access');
  const receiver = { scope, owner: scope.principal.id };
  scope.view();
  projects.push('new-project' as (typeof projects)[number]);
  expect(
    readableEvent(
      {
        id: 1,
        event: 'projects',
        data: { added: ['new-project'] },
        tags: { projects: ['new-project'] },
      },
      receiver,
    )?.data,
  ).toEqual({ added: ['new-project'] });
});

test('suggestion counts debounce once per owner and notify only changed people', async () => {
  const access = createAccessControl(accessFixture());
  const scope = access.forRequest(access.principalFor(person('alice')));
  const events = createEvents(noSuggestions);
  let count = 1;
  let computations = 0;
  const receiver = {
    scope,
    owner: scope.principal.id,
    suggestions: () => {
      computations++;
      return count;
    },
  };
  const readers = [1, 2].map(() =>
    events.stream(new Request('http://localhost/events'), undefined, receiver).body!.getReader(),
  );
  const otherScope = access.forRequest(access.principalFor(person('frank')));
  const otherReader = events
    .stream(new Request('http://localhost/events'), undefined, {
      scope: otherScope,
      owner: otherScope.principal.id,
      suggestions: () => 7,
    })
    .body!.getReader();
  await otherReader.read();
  await Promise.all(readers.map(reader => reader.read()));
  await Promise.all(readers.map(reader => reader.read()));
  expect(new TextDecoder().decode((await otherReader.read()).value)).toContain('"open":7');
  expect(computations).toBe(1);
  count = 2;
  for (let index = 0; index < 5; index++) {
    events.emit('suggestions', { open: 9 }, { audience: 'all' });
  }
  expect(computations).toBe(1);
  for (const reader of readers) {
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"open":2');
  }
  expect(computations).toBe(2);
  events.emit('suggestions', { open: 9 }, { audience: 'all' });
  await Bun.sleep(70);
  events.emit('identity', {}, { audience: 'all' });
  expect(new TextDecoder().decode((await otherReader.read()).value)).toContain('event: identity');
  await otherReader.cancel();
  for (const reader of readers) {
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: identity');
    await reader.cancel();
  }
});

test('tags alone govern delivery even when payload resource names disagree', async () => {
  const { readableEvent } = await import('../../server/projects/event-access');
  const access = createAccessControl(accessFixture());
  const scope = access.forRequest(access.principalFor(person('alice')));
  const receiver = { scope, owner: scope.principal.id };
  expect(
    readableEvent(
      {
        id: 1,
        event: 'identity',
        data: { project: 'sales-contracts' },
        tags: { projects: ['hr-people'] },
      },
      receiver,
    ),
  ).toBeNull();
  for (const event of ['identity', 'recovery']) {
    expect(
      readableEvent({ id: 1, event, data: {}, tags: { audience: 'all' } }, receiver),
    ).not.toBeNull();
  }
});

test('trash events reach owners and authorized restorers but conceal restricted paths', async () => {
  const { readableEvent } = await import('../../server/projects/event-access');
  const access = createAccessControl(accessFixture());
  const owner = access.forRequest(access.principalFor(person('alice')));
  const other = access.forRequest(access.principalFor(person('frank')));
  const admin = access.forRequest(access.principalFor(person('dave')));
  const event = {
    id: 1,
    event: 'trash',
    data: { entries: ['entry'] },
    tags: {
      owner: owner.principal.id,
      paths: [{ project: 'sales-contracts', path: 'orders.odcs.yaml' }],
    },
  };
  const receiver = (scope: typeof owner) => ({ scope, owner: scope.principal.id });
  expect(readableEvent(event, receiver(owner))).not.toBeNull();
  expect(readableEvent(event, receiver(other))).toBeNull();
  expect(readableEvent(event, receiver(admin))).not.toBeNull();
  expect(
    readableEvent(
      {
        ...event,
        tags: {
          ...event.tags,
          paths: [{ project: 'sales-contracts', path: 'finance/hidden.yaml' }],
        },
      },
      receiver(owner),
    ),
  ).toBeNull();
});

// Collects what a stream sends until `done` holds or the time runs out.
async function collect(response: Response, done: (text: string) => boolean, timeout = 1500) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const stop = Date.now() + timeout;
  let text = '';
  while (!done(text) && Date.now() < stop) {
    const timer = Bun.sleep(stop - Date.now()).then(() => ({ done: true, value: undefined }));
    const chunk = await Promise.race([reader.read(), timer]);
    if (chunk.done) break;
    text += decoder.decode(chunk.value);
  }
  await reader.cancel();
  return text;
}

test('project removals reach the project readers and keep the slug from everyone else', async () => {
  const { authWorkspace } = await import('../helpers/auth-workspace');
  using fixture = await authWorkspace();
  const access = createAccessControl({
    ...accessFixture(),
    knownProjects: () => fixture.ws.state.registry().projects.map(project => project.slug),
  });
  const stream = (name: 'alice' | 'carol') => {
    const scope = access.forRequest(access.principalFor(person(name)));
    const request = new Request('http://localhost/api/events');
    return fixture.ws.events.stream(request, undefined, { scope, owner: scope.principal.id });
  };
  const reader = stream('alice');
  const outsider = stream('carol');
  const alice = access.principalFor(person('alice'));
  await fixture.ws.trash.deleteProject('sales-metrics', alice.id);
  const received = await collect(reader, text => text.includes('event: trash'));
  expect(received).toContain('event: projects\ndata: {"added":[],"removed":["sales-metrics"]');
  expect(received).toContain('event: trash');
  const hidden = await collect(outsider, () => false, 300);
  expect(hidden).not.toContain('sales-metrics');
  expect(hidden).not.toContain('event: trash');
});

test('removal readers are fixed per project while the project is still registered', async () => {
  const { currentReaders, readableEvent } = await import('../../server/projects/event-access');
  const fixture = accessFixture();
  const projects: string[] = [...fixture.knownProjects()];
  const access = createAccessControl({ ...fixture, knownProjects: () => projects });
  const receiver = (name: 'alice' | 'carol') => {
    const scope = access.forRequest(access.principalFor(person(name)));
    return { scope, owner: scope.principal.id };
  };
  const alice = receiver('alice');
  const carol = receiver('carol');
  const tags = { projects: ['sales-metrics', 'hr-people'] };
  const readers = currentReaders('projects', tags, [alice, carol]);
  expect(readers).toEqual({ 'sales-metrics': [alice.owner], 'hr-people': [carol.owner] });
  projects.splice(0, projects.length, 'shared-reference');
  const removal = {
    id: 1,
    event: 'projects',
    data: { added: [], removed: ['sales-metrics', 'hr-people'], renamed: [] },
    tags: { ...tags, readers },
  };
  expect(readableEvent(removal, alice)?.data).toEqual({
    added: [],
    removed: ['sales-metrics'],
    renamed: [],
  });
  expect(readableEvent(removal, carol)?.data).toEqual({
    added: [],
    removed: ['hr-people'],
    renamed: [],
  });
});

test('trash events and the trash listing apply the same rule, including project entries', async () => {
  const { readableEvent } = await import('../../server/projects/event-access');
  const { readableTrash } = await import('../../server/projects/trash');
  const access = createAccessControl(accessFixture());
  const people = (['alice', 'frank', 'dave', 'carol'] as const).map(name => {
    const scope = access.forRequest(access.principalFor(person(name)));
    return { scope, owner: scope.principal.id };
  });
  const alice = people[0].owner;
  const entries = [
    { project: 'sales-contracts', deletedBy: alice },
    {
      project: 'sales-contracts',
      paths: [{ project: 'sales-contracts', path: 'orders.odcs.yaml' }],
    },
    {
      project: 'sales-contracts',
      deletedBy: alice,
      paths: [{ project: 'sales-contracts', path: 'orders.odcs.yaml' }],
    },
    {
      project: 'sales-contracts',
      deletedBy: alice,
      paths: [{ project: 'sales-contracts', path: 'finance/revenue-recognition.odcs.yaml' }],
    },
  ];
  for (const entry of entries) {
    for (const receiver of people) {
      const event = {
        id: 1,
        event: 'trash',
        data: { entries: ['entry'] },
        tags: { owner: entry.deletedBy, projects: [entry.project], paths: entry.paths },
      };
      const listed = readableTrash(entry, receiver.scope);
      expect(readableEvent(event, receiver) !== null).toBe(listed);
    }
  }
  const projectEntry = {
    id: 1,
    event: 'trash',
    data: { entries: ['entry'] },
    tags: { owner: alice, projects: ['sales-contracts'] },
  };
  // An entry without original paths falls back to restoring the project itself.
  expect(readableEvent(projectEntry, people[0])).not.toBeNull();
  expect(readableEvent(projectEntry, people[1])).toBeNull();
  expect(readableEvent(projectEntry, people[3])).toBeNull();
});

test('a suggestion round builds one shared index and survives one person failing', async () => {
  const access = createAccessControl(accessFixture());
  const index = [{ project: 'p', path: 'a.yaml', hash: 'h', facts: {} as never }];
  let indexBuilds = 0;
  const events = createEvents({
    sharedSuggestionCount: () => 0,
    suggestionIndex: () => {
      indexBuilds++;
      return index;
    },
  });
  const seen: unknown[] = [];
  const failures: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => failures.push(args[0]);
  try {
    const connect = (name: 'alice' | 'frank', count: (shared?: unknown) => number) => {
      const scope = access.forRequest(access.principalFor(person(name)));
      const receiver = { scope, owner: scope.principal.id, suggestions: count };
      const request = new Request('http://localhost/api/events');
      return events.stream(request, undefined, receiver).body!.getReader();
    };
    const failing = connect('alice', shared => {
      seen.push(shared);
      throw Error('index unavailable');
    });
    const working = connect('frank', shared => {
      seen.push(shared);
      return 4;
    });
    await working.read();
    await failing.read();
    expect(new TextDecoder().decode((await working.read()).value)).toContain('"open":4');
    expect(indexBuilds).toBe(1);
    expect(seen).toEqual([index, index]);
    expect(seen[0]).toBe(seen[1]);
    expect(String(failures[0])).toContain('events.suggestion-refresh-failed');
    await failing.cancel();
    await working.cancel();
  } finally {
    console.error = originalError;
  }
});
