// Runs focused assertions against candidate modules to detect deliberately introduced faults.
import { LOCAL_READER } from '../src/server/projects/reader';
import assert from 'node:assert/strict';
import { loadBrandBundle, setActiveBrand } from '../src/server/brand/bundle';
import { allowEveryRemote } from '../tests/helpers/remote-credentials-fixture';
import { observabilityCase } from './observability-cases';
// Sign-in pages render the brand, so every candidate runs with the shipped bundle active.
setActiveBrand(loadBrandBundle());
const m = await import(process.argv[2]);
const category = process.argv[3];
if (category === 'edge-appearance') {
  const appearance = m.edgeAppearance({ id: 'edge', sourceX: 10, selectable: true, label: 'Link' });
  assert.equal(appearance.label, 'Link');
  assert.equal(Object.hasOwn(appearance, 'sourceX'), false);
  assert.equal(Object.hasOwn(appearance, 'selectable'), false);
}
if (category === 'expansion-viewport') {
  const viewport = m.expansionViewport(
    { x: 0, y: 0, width: 5000, height: 2000 },
    { x: 400, y: 200 },
    { width: 1000, height: 600 },
    1,
  );
  assert.deepEqual(viewport, { x: 100, y: 100, zoom: 1 });
}
if (category === 'clone-progress') {
  const operation = { op: 'clone-one', name: 'Orders' };
  const failure = { op: operation.op, phase: 'failed', message: 'Folder missing.' };
  const early = m.cloneProgressReducer(m.initialCloneProgress, {
    type: 'progress',
    event: failure,
  });
  const started = m.cloneProgressReducer(early, { type: 'started', operation });
  assert.deepEqual(started.progress, failure);
  const running = m.cloneProgressReducer(m.initialCloneProgress, { type: 'started', operation });
  const finished = m.cloneProgressReducer(running, { type: 'progress', event: failure });
  assert.deepEqual(finished.progress, failure);
  const unrelated = m.cloneProgressReducer(running, {
    type: 'progress',
    event: { op: 'another-clone', phase: 'done' },
  });
  assert.deepEqual(unrelated.progress, running.progress);
  const retry = { op: 'clone-retry', name: operation.name };
  const restarted = m.cloneProgressReducer(finished, { type: 'started', operation: retry });
  assert.deepEqual(restarted.progress, { ...retry, phase: 'cloning' });
}
if (category === 'folder-refusal-reason') {
  const folders = m.createProjectFolders({});
  const reader = { ...LOCAL_READER, view: {} };
  function explainsRefusal(error: Error) {
    return error.name === 'BadRequestError' && error.message.includes('Clone the folder instead.');
  }
  await assert.rejects(folders.preview('project', 'folder', reader), explainsRefusal);
  await assert.rejects(folders.apply('project', 'folder', {}, reader), explainsRefusal);
}
if (category === 'edge-label-bounds') {
  const bounds = { x: 0, y: 0, w: 400, h: 200 };
  const request = { id: 'outside', lines: ['2'], at: { x: 200, y: -200 }, room: null, priority: 1 };
  assert.equal(m.placeEdgeLabels([request], [], bounds).size, 0);
  const line = {
    id: 'loop',
    from: 'a.row',
    to: 'b.row',
    fromCard: 'a',
    toCard: 'b',
    kind: 'foreign-key',
    onPath: false,
    count: 2,
    edges: [],
  };
  const context = {
    graph: {},
    positions: { a: { x: 0, y: 0 }, b: { x: 600, y: 0 } },
    routes: {
      loop: [
        { x: 300, y: -400 },
        { x: 500, y: -400 },
      ],
    },
    layoutCards: new Map([
      ['a', { id: 'a', rows: [] }],
      ['b', { id: 'b', rows: [] }],
    ]),
    heights: new Map([
      ['a', 200],
      ['b', 200],
    ]),
    scrolling: new Set(),
  };
  assert.equal(m.buildLineLabels(context, [line]).get('loop').place, undefined);
}
if (category === 'graph-detail-zoom') {
  assert.equal(m.textSizesAt(1).showDetail, true);
  assert.equal(m.textSizesAt(0.99).showDetail, false);
  assert.equal(m.textSizesAt(0.75).showDetail, false);
}
if (category === 'example-registry') {
  const { EXPECTED_EXAMPLE_METRICS, checkExampleSetMetrics } =
    await import('./example-metric-checks');
  for (const setId of Object.keys(EXPECTED_EXAMPLE_METRICS))
    await checkExampleSetMetrics(setId, m.EXAMPLE_SETS, 'one of each kind');
}
if (category === 'edge-path') {
  const path = 'M 10 20 C 30 40 50 60 70 80';
  assert(m.pathMatchesEndpoints(path, 10, 20, 70, 80));
  assert(!m.pathMatchesEndpoints(path, 11, 20, 70, 80));
  assert(!m.pathMatchesEndpoints(path, 10, 20, 71, 80));
}
if (category === 'layout') {
  const nodes = m.layoutGraph(
    ['a', 'b', 'c'],
    [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ],
  );
  assert(nodes[0].position.x < nodes[1].position.x && nodes[1].position.x < nodes[2].position.x);
  const ids = Array.from({ length: 30 }, (_, i) => String(i));
  const p = m.layoutGraph(
    ids,
    ids.slice(1).map(id => ({ source: '0', target: id })),
  );
  assert.equal(new Set(p.map((n: any) => JSON.stringify(n.position))).size, 30);
  assert(Math.max(...p.map((n: any) => n.position.y)) <= 450);
}
if (category === 'layout') {
  const p = m.neighborhoodLayout('c', ['i'], ['o']);
  assert(p.get('i').x < 0 && p.get('o').x > 0 && p.get('c').x === 0);
}
if (category === 'graph') {
  const nodes = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    name: `Entity ${i}`,
    kind: 'Entity',
    description: '',
    path: [],
    fields: [],
  }));
  const edge = (s: string, t: string, id = s + '-' + t) => ({
    id,
    source: s,
    target: t,
    label: id,
    data: { path: [], definition: {}, kind: 'relationship' },
  });
  const edges = [...nodes.slice(1).map(n => edge('0', n.id)), edge('1', '2')];
  const v = m.graphView(nodes, edges, '');
  assert.equal(v.entities.length, 8);
  assert.equal(m.graphView(nodes, edges, '', true).entities.length, 30);
  assert.equal(m.graphView(nodes, edges, 'absent').entities.length, 0);
  const n = m.neighborhood(nodes, edges, { center: '0', limit: 5 });
  assert.equal(n.center, '0');
  assert.equal(n.hidden, 24);
  assert(m.neighborhood(nodes, edges, { center: '1' }).edges.some((e: any) => e.id === '0-2'));
  assert.equal(m.neighborhood(nodes, edges, { center: '5' }).center, '5');
  assert.equal(
    m.searchEntities(
      [
        { ...nodes[0], name: 'OrderLine' },
        { ...nodes[1], name: 'Order' },
      ],
      'order',
    )[0].name,
    'Order',
  );
  assert.deepEqual(
    m
      .searchEntities(
        [
          { ...nodes[0], name: 'Reorder' },
          { ...nodes[1], name: 'PurchaseOrder' },
        ],
        'order',
      )
      .map((e: any) => e.name),
    ['PurchaseOrder', 'Reorder'],
  );
  const rdf = [
    { ...nodes[0], kind: 'OWL class' },
    { ...nodes[1], kind: 'OWL property' },
  ];
  assert.deepEqual(
    m.neighborhood(rdf, [edge('1', '0')], { center: '0' }).entities.map((e: any) => e.id),
    ['0'],
  );
  const g = m.groupRelationships([
    edge('a', 'b', 'one'),
    edge('a', 'b', 'two'),
    edge('a', 'c', 'three'),
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].data.relationships.length, 2);
}
if (category === 'routes') {
  const box = (x: number, y: number) => ({ x, y, width: 250, height: 96 });
  const boxes = new Map([
    ['c', box(0, 200)],
    ['a', box(-360, 0)],
    ['b', box(-360, 400)],
    ['r', box(360, 0)],
    ['s', box(360, 400)],
    ['f', box(-720, 200)],
  ]);
  const routes = m.assignRoutes(
    [
      { id: 'a>c', source: 'a', target: 'c' },
      { id: 'b>c', source: 'b', target: 'c' },
      { id: 'f>r', source: 'f', target: 'r' },
      { id: 'f>s', source: 'f', target: 's' },
    ],
    boxes,
  );
  assert.notEqual(routes.get('a>c').bendX, routes.get('b>c').bendX);
  assert.notEqual(routes.get('f>r').laneY, routes.get('f>s').laneY);
  assert.equal(
    m.orthogonalPath([
      [300, 100],
      [320, 100],
      [320, 400],
      [0, 400],
    ]),
    'M 300,100 L 310,100 Q 320,100 320,110 L 320,390 Q 320,400 310,400 L 0,400',
  );
}
if (category === 'walk') {
  let w = m.emptyWalk;
  for (const c of ['a', 'b', 'c'])
    w = m.walkReducer(w, { type: 'push', step: { doc: 'd', center: c, name: c } });
  w = m.walkReducer(m.walkReducer(w, { type: 'back' }), { type: 'back' });
  w = m.walkReducer(w, { type: 'push', step: { doc: 'd', center: 'x', name: 'x' } });
  assert.deepEqual(
    w.steps.map((s: any) => s.center),
    ['a', 'x'],
  );
}
if (category === 'export') {
  const r = m.exportDocument('original source\n', 'file.ttl');
  assert.equal(r.filename, 'file.ttl');
  assert.equal(await r.blob.text(), 'original source\n');
  assert(r.blob.type.includes('text/turtle'));
}
if (category === 'model') {
  const source =
    'name: Sample\nunknown: preserved\nontology: [{concept: Customer, type: EntityType}]\n';
  const edited = m.editEntity(source, ['ontology', 0], 'Updated');
  assert.equal(m.inspect(edited).entities[0].description, 'Updated');
  assert(edited.includes('unknown: preserved'));
}
// Folder store cases run on isolated temporary data roots with a test Git identity.
if (
  [
    'files',
    'atomic',
    'migration',
    'paths',
    'events-origin',
    'journal',
    'trash',
    'confirm',
  ].includes(category)
) {
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const fs = await import('node:fs');
  const { join } = await import('node:path');
  const { createHash } = await import('node:crypto');
  const hash = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
  const source = 'name: Sample\nontology: [{concept: Customer, type: EntityType}]\n';
  const d = tempDataDir();
  try {
    if (category === 'files') {
      const ws = await m.openWorkspace({ root: d.root });
      try {
        await ws.importBatch({ files: [{ path: 'a.yaml', source }] }, LOCAL_READER);
        await ws.saveFile(
          'sample',
          'a.yaml',
          { baseHash: hash(source), source: source.replace('Customer', 'Buyer') },
          LOCAL_READER,
        );
        await assert.rejects(
          () =>
            ws.saveFile(
              'sample',
              'a.yaml',
              { baseHash: hash(source), source: source.replace('Customer', 'Other') },
              LOCAL_READER,
            ),
          /changed/,
        );
        await assert.rejects(() =>
          ws.saveFile(
            'sample',
            'a.yaml',
            { baseHash: hash(source.replace('Customer', 'Buyer')), source: 'ontology: []' },
            LOCAL_READER,
          ),
        );
        assert.equal(
          fs.readFileSync(join(d.root, 'projects/sample/a.yaml'), 'utf8'),
          source.replace('Customer', 'Buyer'),
        );
        // Import commits: only the imported paths, never the user's other changes.
        const r = await ws.importInto(
          'sample',
          [{ path: 'b.yaml', source }],
          undefined,
          LOCAL_READER,
        );
        assert.equal(r.commit.committed, true);
        const shown = (
          await ws.git.run(join(d.root, 'projects/sample'), [
            'show',
            '--name-only',
            '--format=',
            'HEAD',
          ])
        ).stdout.trim();
        assert.equal(shown, 'b.yaml');
      } finally {
        ws.close();
      }
    }
    if (category === 'atomic') {
      const file = join(d.root, 'x.yaml');
      fs.writeFileSync(file, 'original');
      assert.throws(() =>
        m.atomicWrite(file, 'new bytes', {
          beforeRename: () => {
            throw Error('crash');
          },
        }),
      );
      assert.equal(fs.readFileSync(file, 'utf8'), 'original');

      // A destination held open by another process is retried on Windows only, within a budget.
      const renameFailing = (codes: string[], platform: string) => {
        let attempts = 0;
        const environment = {
          platform,
          pause: () => {},
          rename: () => {
            attempts += 1;
            const code = codes.shift();
            if (code) throw Object.assign(Error(code), { code });
          },
        };
        return { environment, attempts: () => attempts };
      };
      const windowsLock = renameFailing(['EPERM', 'EBUSY'], 'win32');
      m.replaceFile('a.tmp', 'a', windowsLock.environment);
      assert.equal(windowsLock.attempts(), 3);
      const linuxLock = renameFailing(['EPERM'], 'linux');
      assert.throws(() => m.replaceFile('a.tmp', 'a', linuxLock.environment));
      assert.equal(linuxLock.attempts(), 1);
      const missing = renameFailing(['ENOENT'], 'win32');
      assert.throws(() => m.replaceFile('a.tmp', 'a', missing.environment));
      const stuck = renameFailing(Array(1_000).fill('EPERM'), 'win32');
      assert.throws(() => m.replaceFile('a.tmp', 'a', stuck.environment));
    }
    if (category === 'paths') {
      for (const bad of ['../x', 'a/../../x', '.git/config', 'a/.git/x'])
        assert.throws(() => m.projectPath(bad));
      assert.equal(m.projectPath('a/b.yaml'), 'a/b.yaml');
    }
    if (category === 'journal') {
      const layout = { root: d.root, journal: join(d.root, 'state/journal') } as any;
      fs.mkdirSync(layout.journal, { recursive: true });
      fs.mkdirSync(join(d.root, 'x'));
      fs.mkdirSync(join(d.root, 's'));
      fs.writeFileSync(join(d.root, 'x/a'), 'A');
      fs.writeFileSync(join(d.root, 's/b'), 'B');
      fs.writeFileSync(join(d.root, 'x/b'), 'other');
      fs.writeFileSync(
        join(layout.journal, 'op.json'),
        JSON.stringify({
          formatVersion: 1,
          opId: 'op',
          kind: 'move',
          steps: [
            { action: 'rename', from: 's/a', to: 'x/a', done: true },
            { action: 'rename', from: 's/b', to: 'x/b', done: false },
          ],
          cleanup: [],
          startedAt: 't',
        }),
      );
      const [outcome] = m.createJournal(layout).recover();
      assert.equal(outcome.outcome, 'rolled-back');
      assert.equal(fs.readFileSync(join(d.root, 'x/b'), 'utf8'), 'other');
      assert.equal(fs.readFileSync(join(d.root, 's/a'), 'utf8'), 'A');
    }
    if (category === 'events-origin') {
      const { openWorkspace } = await import('../src/server/projects/workspace');
      const ws = await openWorkspace({ root: d.root });
      try {
        const h = m.createHandler(ws);
        assert.equal(
          (
            await h(
              new Request('http://127.0.0.1:4310/api/events', {
                headers: { origin: 'https://evil.example' },
              }),
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await h(
              new Request('http://127.0.0.1:4310/api/projects', {
                headers: { origin: 'https://evil.example' },
              }),
            )
          ).status,
          403,
        );
      } finally {
        ws.close();
      }
    }
    if (category === 'trash') {
      let clock = Date.parse('2026-10-21T10:00:00Z');
      const { openWorkspace } = await import('../src/server/projects/workspace');
      const { LOCAL_READER } = await import('../src/server/projects/reader');
      const ws = await openWorkspace({ root: d.root, now: () => clock });
      try {
        await ws.importBatch({ files: [{ path: 'a.yaml', source }] }, LOCAL_READER);
        const trash = m.createTrash({
          layout: ws.layout,
          state: ws.state,
          journal: ws.journal,
          lock: ws.lock,
          projects: () => ws.state.registry().projects,
          registrySteps: ws.registrySteps,
          afterFiles: (s: string) => ws.rescan(s),
          forgetProject: () => {},
          adoptProject: async () => {},
          createProject: async () => {
            throw Error('unused');
          },
          emit: () => {},
          withCurrentReaders: (_event: string, tags: object) => tags,
          now: () => clock,
        });
        const first = await trash.deleteFile('sample', 'a.yaml', undefined, LOCAL_READER);
        clock += 10_001;
        await assert.rejects(
          () => trash.undo(first.entryId, LOCAL_READER),
          (e: any) => e.name === 'GoneError',
        );
        fs.writeFileSync(
          join(d.root, 'projects/sample/a.yaml'),
          'name: Newer\nontology: [{concept: N}]\n',
        );
        await assert.rejects(
          () => trash.restore(first.entryId, {}, LOCAL_READER),
          (e: any) => e.name === 'OccupiedError' && e.suggestion.toPath === 'a (2).yaml',
        );
        assert.equal(
          fs.readFileSync(join(d.root, 'projects/sample/a.yaml'), 'utf8'),
          'name: Newer\nontology: [{concept: N}]\n',
        );
        // Revert: the replaced version goes to a trash entry, the committed bytes come back.
        const newer = 'name: Newer\nontology: [{concept: N}]\n';
        const rv = await trash.revertFile(
          'sample',
          'a.yaml',
          hash(newer),
          new TextEncoder().encode(source),
          LOCAL_READER,
        );
        assert.equal(fs.readFileSync(join(d.root, 'projects/sample/a.yaml'), 'utf8'), source);
        assert.equal(
          fs.readFileSync(join(d.root, 'trash', rv.trashEntry, 'payload', 'a.yaml'), 'utf8'),
          newer,
        );
      } finally {
        ws.close();
      }
    }
    if (category === 'confirm') {
      assert.throws(() => m.requireConfirm({}));
      assert.throws(() => m.requireConfirm({ confirm: 'yes' }));
      m.requireConfirm({ confirm: true });
      const { openWorkspace } = await import('../src/server/projects/workspace');
      const ws = await openWorkspace({ root: d.root });
      try {
        await ws.importBatch({ files: [{ path: 'a.yaml', source }] }, LOCAL_READER);
        await assert.rejects(async () =>
          m.trashRoutes(
            ws,
            new Request('http://x/api/projects/sample/files/a.yaml', {
              method: 'DELETE',
              body: '{}',
            }),
            new URL('http://x/api/projects/sample/files/a.yaml'),
          ),
        );
        await assert.rejects(async () =>
          m.trashRoutes(
            ws,
            new Request('http://x/api/clear', { method: 'POST', body: '{}' }),
            new URL('http://x/api/clear'),
          ),
        );
        assert(fs.existsSync(join(d.root, 'projects/sample/a.yaml')));
      } finally {
        ws.close();
      }
    }
    if (category === 'migration') {
      const { Database } = await import('bun:sqlite');
      const { dataLayout } = await import('../src/server/projects/paths');
      const { createState } = await import('../src/server/projects/state');
      const { createJournal } = await import('../src/server/projects/journal');
      const { createGit } = await import('../src/server/projects/git');
      const layout = dataLayout(d.root);
      for (const dir of [layout.projects, layout.state, layout.backup])
        fs.mkdirSync(dir, { recursive: true });
      const db = new Database(layout.legacyDb, { create: true });
      db.exec(
        'CREATE TABLE documents(id TEXT PRIMARY KEY,filename TEXT NOT NULL,source TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL)',
      );
      db.query('INSERT INTO documents VALUES(?,?,?,1,?)').run('one', 'a.yaml', source, 't');
      db.close();
      const ctx = {
        layout,
        state: createState(layout),
        journal: createJournal(layout),
        git: createGit({ projectsRoot: layout.projects }),
        gitAvailable: true,
        identityConfigured: true,
      };
      const report = await m.migrateLegacy(ctx, {
        afterWrite: (file: string) => fs.writeFileSync(file, 'tampered'),
      });
      assert.equal(report.status, 'failed');
      assert.equal(fs.readdirSync(layout.projects).length, 0);
      assert.equal(ctx.state.hasRegistry(), false);
    }
  } finally {
    d.cleanup();
  }
}

if (category === 'overview') {
  const { inspect } = await import('../src/shared/core/model');
  const input = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const o = m.modelOverview(input.entities, input.edges, input.name);
  const flights = inspect(await Bun.file('public/examples/ossie/flights.ontology.yaml').text());
  assert.equal(m.modelOverview(flights.entities, flights.edges, flights.name).mode, 'suggested');
  const corrected = m.modelOverview(flights.entities, flights.edges, flights.name, false, {
    mode: 'types',
    assignments: { [flights.entities[0].id]: 'custom:Review' },
    names: { 'custom:Review': 'Review' },
  });
  assert.equal(corrected.groupOf.get(flights.entities[0].id), 'custom:Review');
  const ns = inspect(
    'name: N\nprefixes: {a: "https://a.example/", b: "https://b.example/"}\nontology: [{concept: X, type: EntityType, iri: "a:X"}, {concept: Y, type: EntityType, iri: "b:Y"}, {concept: Z, type: EntityType}]\n',
  );
  const nso = m.modelOverview(ns.entities, ns.edges, ns.name);
  assert.equal(nso.mode, 'namespaces');
  assert.deepEqual(
    nso.groups.map((g: any) => g.name),
    ['a:', 'b:', 'No IRI'],
  );
  assert.equal(o.groups.length, 8);
  assert.equal(o.groups.flatMap((g: any) => g.entities).length, 45);
  assert.equal([...o.matrix.values()].flat().length, 277);
  for (const [key, links] of o.matrix) {
    const [from, to] = JSON.parse(key);
    assert(
      links.every((e: any) => o.groupOf.get(e.source) === from && o.groupOf.get(e.target) === to),
    );
  }
  const contract = inspect(
    await Bun.file('public/examples/ubl/ubl.odcs.yaml').text(),
    'ubl.odcs.yaml',
  );
  const contractOverview = m.modelOverview(contract.entities, contract.edges, contract.name);
  assert.notEqual(contractOverview.mode, 'declared');
  assert.equal(
    contractOverview.modes.declared.reason,
    'Only the contract-level domain is declared',
  );
  assert.equal(contractOverview.modes.suggested.reason, undefined);
  assert(contractOverview.modes.suggested.groups > 1);
  const owl = inspect(await Bun.file('public/examples/ubl/ubl.owl.ttl').text(), 'ubl.owl.ttl');
  assert.equal(m.modelOverview(owl.entities, owl.edges, owl.name).entities.length, 45);
  assert.equal(
    m.modelOverview(owl.entities, owl.edges, owl.name, true).entities.length,
    owl.entities.length,
  );
}

if (category === 'full-layout') {
  const { default: ELK } = await import('elkjs/lib/elk-api.js');
  const elk = new ELK({
    algorithms: ['layered', 'sporeOverlap'],
    workerFactory: () => new Worker(import.meta.resolve('elkjs/lib/elk-worker.min.js')),
  });
  try {
    const result = await m.packNetwork(
      {
        nodes: [
          { id: 'area:g', group: 'g', x: 0, y: 0, width: 250, height: 200 },
          { id: 'a', parentId: 'area:g', x: 28, y: 62, width: 184, height: 60 },
          { id: 'b', parentId: 'area:g', x: 30, y: 65, width: 184, height: 60 },
        ],
        entityCount: 2,
        relationshipCount: 1,
        routes: {},
      },
      elk,
    );
    const children = result.nodes.filter((n: any) => !n.group);
    assert.equal(children.length, 2);
    const [a, b] = children;
    assert(
      !(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y),
    );
  } finally {
    elk.terminateWorker();
  }
}

if (category === 'validation') {
  const ontology = {
    ontology: [
      { concept: 'A', relationships: [{ name: 'b', roles: [{ concept: 'B' }] }] },
      { concept: 'B' },
    ],
  };
  assert.doesNotThrow(() => m.validateStructured(ontology));
  const invalids: any[] = [];
  let d = structuredClone(ontology);
  invalids.push({ ontology: [{ concept: 'A' }, { concept: 'A' }] });
  d = structuredClone(ontology);
  (d.ontology[0] as any).extends = ['B'];
  (d.ontology[1] as any).extends = ['A'];
  invalids.push(d);
  d = structuredClone(ontology);
  d.ontology[0].relationships![0].roles[0].concept = 'Missing';
  invalids.push(d);
  const join = {
    name: 'S',
    datasets: [
      {
        name: 'a',
        source: 'db.a',
        fields: [
          { name: 'id', expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'id' }] } },
        ],
      },
    ],
    relationships: [{ name: 'self', from: 'a', to: 'a', from_columns: ['id'], to_columns: ['id'] }],
  };
  assert.doesNotThrow(() => m.validateStructured(join));
  const unknown = structuredClone(join);
  unknown.relationships[0].from_columns = ['missing'];
  invalids.push(unknown);
  const lengths = structuredClone(join);
  lengths.relationships[0].from_columns = ['id', 'id'];
  invalids.push(lengths);
  invalids.push({
    kind: 'DataContract',
    apiVersion: 'v3.1.0',
    id: 'x',
    version: '1',
    schema: [{ name: 'x' }],
  });
  const iri = {
    version: '0.2.0.dev0',
    name: 'I',
    prefixes: { ex: 'https://example.org/' },
    ontology: [
      { concept: 'A', type: 'EntityType', iri: 'ex:A' },
      { concept: 'B', type: 'EntityType', iri: 'https://example.org/B' },
    ],
  };
  assert.doesNotThrow(() => m.validateStructured(iri));
  d = structuredClone(iri);
  (d as any).ontology[0].iri = 'zz:A';
  invalids.push(d);
  d = structuredClone(iri);
  (d as any).ontology[1].iri = 'https://example.org/A';
  invalids.push(d);
  for (const input of invalids) assert.throws(() => m.validateStructured(input));
}
if (category === 'diagnostics') {
  assert.doesNotThrow(() => m.validateEnvelope('ontology: [{concept: A}]', 'x.yaml'));
  assert.throws(() => m.validateEnvelope('source', ''));
  assert.throws(() => m.validateEnvelope('é'.repeat(1000001), 'x.yaml'));
  assert.throws(() =>
    m.rejectIssues([{ severity: 'error', code: 'test', path: '/', message: 'test' }]),
  );
}
if (category === 'rdf-validation') {
  const { graph, parse } = await import('rdflib');
  const prefix =
    '@prefix ex: <https://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix owl: <http://www.w3.org/2002/07/owl#> . ';
  const check = (source: string) => {
    const store = graph();
    parse(prefix + source, store, 'https://example.org/', 'text/turtle');
    return m.validateRdf(store);
  };
  assert.doesNotThrow(() => check('ex:S sh:path ex:p; sh:minCount 0; sh:maxCount 2 .'));
  assert.throws(() => check('ex:S sh:path ex:p; sh:minCount 3; sh:maxCount 1 .'));
  assert.throws(() => check('ex:S a sh:PropertyShape .'));
  assert.throws(() => check('ex:R a owl:Restriction; owl:someValuesFrom ex:C .'));
}

if (category === 'agent') {
  const legacy = [
    {
      id: '0',
      filename: 'm.yaml',
      revision: 1,
      source:
        'version: 0.2.0.dev0\nname: m\nontology_ref: {name: O}\nsemantic_model_ref: {name: s}\nconcept_mappings:\n  - concept: A\n    object_mappings: [{referent_mappings: [{relationship: id, expression: t.id}]}]\n',
    },
    {
      id: '1',
      filename: 'o.yaml',
      revision: 1,
      source:
        'version: 0.2.0.dev0\nname: O\nontology:\n  - {concept: Id, type: ValueType, extends: [String]}\n  - concept: A\n    type: EntityType\n    identify_by: [id]\n    relationships: [{name: id, roles: [{concept: Id}], multiplicity: OneToOne, verbalizes: ["{A} has {Id}"]}]\n',
    },
    {
      id: '2',
      filename: 's.yaml',
      revision: 1,
      source:
        'version: 0.2.0.dev0\nsemantic_model:\n  - name: s\n    datasets: [{name: t, source: t, fields: [{name: id, expression: {dialects: [{dialect: ANSI_SQL, expression: id}]}}]}]\n',
    },
  ];
  const resolved = m.buildContext(legacy, '0');
  assert.equal(resolved.findings.length, 0);
  assert.deepEqual(resolved.fields[0].evidence.path, [
    'semantic_model',
    0,
    'datasets',
    0,
    'fields',
    0,
  ]);
  const { parse, stringify } = await import('yaml');
  const docs = await Promise.all(
    ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml'].map(
      async (filename, i) => ({
        id: String(i),
        filename,
        revision: 1,
        source: await Bun.file('public/examples/commerce/' + filename).text(),
      }),
    ),
  );
  const change = (index: number, edit: (data: any) => void) => {
    const clone = structuredClone(docs);
    const data = parse(clone[index].source);
    edit(data);
    clone[index].source = stringify(data);
    return clone;
  };
  const context = m.buildContext(docs, '0');
  assert.equal(context.findings.length, 0);
  const request = {
    mappingId: '0',
    metrics: ['gross_revenue'],
    dimensions: ['["customers","region"]'],
  };
  const plan = (source = docs, overrides = {}) =>
    m.planQuery(m.buildContext(source, '0'), { ...request, ...overrides });
  const arithmetic = change(2, d => {
    d.datasets[0].fields[2].expression.dialects[0].expression = 'amount + fee';
    d.metrics[0].expression.dialects[0].expression = 'SUM(orders.amount * 2)';
  });
  assert(plan(arithmetic).sql.includes('("orders".amount + "orders".fee) * 2'));
  assert(plan().sql.includes('SUM('));
  assert(plan().sql.includes('GROUP BY'));
  assert(
    m
      .selectContext(context, ['Revenue'])
      .bindings.every((b: any) => b.rootConcept === 'Revenue' || b.concept === 'Revenue'),
  );
  assert(
    m
      .buildContext(
        change(
          0,
          d =>
            (d.concept_mappings[0].object_mappings[0].referent_mappings[0].expression =
              'customers.missing'),
        ),
        '0',
      )
      .findings.some((f: any) => f.severity === 'error'),
  );
  assert.throws(() =>
    plan(
      change(
        2,
        d => (d.metrics[1].expression.dialects[0].expression = 'SUM(customers.customer_id)'),
      ),
      { metrics: ['gross_revenue', 'order_count'] },
    ),
  );
  assert.throws(() =>
    plan(change(2, d => d.relationships.push({ ...d.relationships[0], name: 'parallel' }))),
  );
  assert.throws(() => plan(change(2, d => delete d.datasets[1].primary_key)));
}
if (category === 'iri') {
  assert.deepEqual(m.expandIri('ex:A', { ex: 'https://example.org/' }), {
    iri: 'https://example.org/A',
    prefix: 'ex',
  });
  assert('error' in m.expandIri('zz:A', { ex: 'https://example.org/' }));
  assert.deepEqual(m.expandIri('https://x.example/A'), { iri: 'https://x.example/A' });
}
if (category === 'odcs') {
  const data = {
    schema: [
      { name: 'a', properties: [{ name: 'id' }] },
      {
        name: 'b',
        properties: [
          { name: 'a_id', relationships: [{ to: 'a.id' }] },
          { name: 'x_id', relationships: [{ to: 'x.id' }] },
        ],
      },
    ],
  };
  assert.equal(m.odcsForeignKeys(data).length, 1);
  assert.equal(m.odcsReferenceIssues(data).length, 1);
  // Column pairs: referenced column kept; unequal composite arity pairs nothing.
  assert.deepEqual(
    [m.odcsForeignKeys(data)[0].fromColumns, m.odcsForeignKeys(data)[0].toColumns],
    [['a_id'], ['id']],
  );
  const composite = {
    schema: [
      { name: 'a', properties: [{ name: 'x' }, { name: 'y' }] },
      {
        name: 'b',
        properties: [{ name: 'ax' }],
        relationships: [{ from: ['b.ax'], to: ['a.x', 'a.y'] }],
      },
    ],
  };
  assert.deepEqual(m.odcsForeignKeys(composite)[0].toColumns, []);
  assert.equal(m.odcsReferenceIssues(composite).length, 1);
}
if (category === 'suggestions') {
  const f = (project: string, path: string, facts: any) => ({
    project,
    path,
    hash: path,
    facts: { names: [], refs: [], iris: [], physical: [], sources: [], ...facts },
  });
  const own = f('p', 'o.yaml', { names: ['Flights'] });
  for (const ref of ['Flight', 'flights', 'Flig', 'FLIGHTS semantic'])
    assert.equal(m.evidenceBetween(f('q', 'm.yaml', { refs: [ref] }), own).length, 0);
  assert.equal(m.evidenceBetween(f('q', 'm.yaml', { refs: ['Flights'] }), own).length, 1);
  assert.equal(
    m.inferSuggestions([own, f('q', 'm.yaml', { refs: ['Flightz'] })], new Set()).length,
    0,
  );
}
if (category === 'references') {
  const entity = {
    id: 'ontology/0',
    name: 'P',
    kind: 'EntityType',
    path: [],
    description: '',
    fields: [],
    definition: { iri: 'core:P' },
  };
  assert(
    m
      .entityKeys(entity, {
        entities: [entity],
        document: { prefixes: { core: 'https://example.org/core#' } },
      })
      .includes('https://example.org/core#P'),
  );
}
// Metrics read side: rollup refusal, lineage by exact physical names, both Ossie layouts.
if (category === 'explain') {
  const docs = await Promise.all(
    ['mall.mapping.yaml', 'mall.ontology.yaml', 'mall.semantic.yaml', 'mall.odcs.yaml'].map(
      async f => ({
        id: 'mall/' + f,
        project: 'mall',
        path: f,
        filename: f,
        revision: 1,
        source: await Bun.file('public/examples/mall/' + f).text(),
      }),
    ),
  );
  assert.match(
    m.explainMetric(docs, 'mall', 'mall.semantic.yaml', 'occupancy_rate', { rollup: 'sum' })
      .sqlPreview.refused ?? '',
    /Summing ratios/,
  );
  assert.deepEqual(
    m
      .explainMetric(docs, 'mall', 'mall.semantic.yaml', 'billed_amount')
      .inputs[0].fields[0].odcs.map((o: any) => o.property),
    ['amount'],
  );
  const flights = [
    {
      id: 'f/flights.yaml',
      project: 'f',
      path: 'flights.yaml',
      filename: 'flights.yaml',
      revision: 1,
      source: (await Bun.file('public/examples/ossie/flights.yaml').text()).replace(
        /^(    datasets:)/m,
        '    metrics:\n      - name: n\n        expression: {dialects: [{dialect: ANSI_SQL, expression: "COUNT(FLIGHT.id)"}]}\n$1',
      ),
    },
  ];
  assert.deepEqual(
    m.projectMetrics(flights, 'f').map((k: any) => k.name),
    ['n'],
  );
}
if (category === 'metric-extension') {
  const metric = (data: any) => ({
    custom_extensions: [{ vendor_name: 'SEMANTIC_WORKBENCH', data: JSON.stringify(data) }],
  });
  assert.equal(
    m.readMetricExtension(metric({ schema: 'semantic-workbench/metric/v1', type: 'simple' })).issues
      .length,
    0,
  );
  assert(
    m.readMetricExtension(
      metric({ schema: 'semantic-workbench/metric/v1', type: 'simple', additivity: 'sometimes' }),
    ).issues.length > 0,
  );
}
if (category === 'model-layout') {
  const model = m.inspect(
    await Bun.file('public/examples/ossie/flights.yaml').text(),
    'flights.yaml',
  );
  assert.equal(model.layout, 'embedded (deprecated)');
  assert(model.entities.filter((e: any) => e.kind === 'Dataset').length >= 6);
}
// Source editor: CRLF-preserving patches, lint ranges, patch-based saves.
if (category === 'patch') {
  const { EditorState } = await import('@codemirror/state');
  const original = 'a: 1\r\nb: 2\r\n';
  const state = EditorState.create({ doc: original });
  const tr = state.update({ changes: { from: 4, insert: '\nz: 9' } });
  assert.equal(
    m.applyPatches(original, m.changesToPatches(original, state.doc, tr.changes)),
    'a: 1\r\nz: 9\r\nb: 2\r\n',
  );
  const q = m.diffPatches('x\r\ny', 'x\ny');
  assert.equal(m.applyPatches('x\r\ny', q), 'x\ny');
  assert.equal(q[0].from, 1);
}
if (category === 'lint') {
  const { Text } = await import('@codemirror/state');
  const r = m.toDiagnostics(
    [{ severity: 'error', code: 'x', path: '/', message: 'm', line: 1, column: 1 }],
    Text.of(['abc']),
  );
  assert.equal(r.diagnostics.length, 1);
  assert.equal(r.documentLevel.length, 0);
}
// An item edit changes one value; the rest keeps its own layout (no re-serialization).
if (category === 'json-patch') {
  const { applyPatches } = await import('../src/shared/editor/patch');
  const { parseDocument } = await import('yaml');
  const src = '{\n    "a": 1,\n    "tags": ["x", "y"],\n    "b": {"c": 2}\n}\n';
  assert.equal(
    applyPatches(
      src,
      m.jsonPatches(
        src,
        parseDocument(src).contents,
        JSON.parse(src),
        { ...JSON.parse(src), a: 5 },
        { eol: '\n', unit: '    ', json: true },
      ),
    ),
    src.replace('"a": 1', '"a": 5'),
  );
}
if (category === 'yaml-patch') {
  const { applyPatches } = await import('../src/shared/editor/patch');
  const src =
    '# keep\nname: X\nontology:\n  - concept: A   # tail\n    type: EntityType\n    extends: [B]\n';
  const item = m.itemValue(src, ['ontology', 0]);
  assert.equal(
    applyPatches(src, m.valuePatches(src, ['ontology', 0], { ...item, description: 'd' })),
    src.replace('    extends: [B]\n', '    extends: [B]\n    description: d\n'),
  );
}
if (category === 'dependents') {
  const src =
    'name: X\nontology:\n  - concept: A\n    type: EntityType\n    relationships:\n      - name: r\n        roles:\n          - concept: B\n  - concept: B\n    type: EntityType\n';
  const refs = m.findReferences({ kind: 'concept', name: 'B', docId: 'd', path: ['ontology', 1] }, [
    { id: 'd', path: 'x.yaml', filename: 'x.yaml', source: src },
  ]);
  assert.deepEqual(
    refs.map((r: any) => r.dependent?.path),
    [['ontology', 0, 'relationships', 0]],
  );
}
if (category === 'kpi-draft') {
  const d = {
    type: 'ratio',
    numerator: 'a',
    denominator: 'b',
    label: 'R',
    inputs: '',
    aggregation: 'SUM',
    field: '',
    expression: '',
    additivity: '',
    timeDimension: '',
    minGrain: '',
    grains: [],
    dimensions: [],
    direction: '',
    target: '',
    warning: '',
    critical: '',
    owner: 'o',
    steward: '',
    status: 'proposed',
    unit: '',
    format: '',
    window: '',
    windowLength: '',
    windowGrain: '',
    filterField: '',
    filterOperator: '',
    filterValue: '',
  };
  assert.equal(m.expressionFor(d), 'a / NULLIF(b, 0)');
  assert.deepEqual(m.extensionFor(d), {
    label: 'R',
    type: 'ratio',
    numerator: 'a',
    denominator: 'b',
    additivity: 'non_additive',
    owner: 'o',
    status: 'proposed',
  });
}
if (category === 'kpi-save') {
  const fs = await import('node:fs');
  const files = ['mall.semantic.yaml', 'mall.mapping.yaml', 'mall.ontology.yaml'].map(p => ({
    path: p,
    source: fs.readFileSync('public/examples/mall/' + p, 'utf8'),
  }));
  const plan = m.planKpiSave(files, {
    semanticPath: 'mall.semantic.yaml',
    metric: { name: 'aaa_rate', expression: 'vacant_gla / NULLIF(total_gla, 0)' },
    extension: { type: 'ratio', numerator: 'vacant_gla', denominator: 'total_gla' },
    binding: { measures: 'Property' },
  });
  const mapping = plan.writes.find((w: any) => w.path === 'mall.mapping.yaml').source;
  const before = files[1].source.split('\n');
  const after = mapping.split('\n');
  const at = after.findIndex((l: string) => l.includes('"aaa_rate"'));
  assert.equal(after.length, before.length + 1);
  assert.equal(after[at + 1], before[at]);
  assert(after[at + 1].includes('"billed_amount"'));
  assert(!plan.writes[0].source.split('\n').some((l: string) => l.includes('"expression"')));
}
if (category === 'status-rules') {
  const ext = (status: string, extra: any = {}) => ({
    name: 'k',
    expression: { dialects: [{ dialect: 'ANSI_SQL', expression: extra.expr ?? 'a' }] },
    custom_extensions: [
      {
        vendor_name: 'SEMANTIC_WORKBENCH',
        data: JSON.stringify({ schema: 'semantic-workbench/metric/v1', type: 'simple', status }),
      },
    ],
  });
  const r = m.applyStatusRules(ext('approved'), ext('approved', { expr: 'b' }));
  assert.equal(m.extensionOf(r.item).value.status, 'proposed');
}
if (category === 'save-client') {
  let body: any;
  (globalThis as any).fetch = async (_u: string, init: any) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ path: 'a', hash: 'h' }), { status: 200 });
  };
  await m.api.save('p', 'a.yaml', 'a'.repeat(64), 'new', [{ from: 0, to: 1, insert: 'x' }]);
  assert.deepEqual(body, { baseHash: 'a'.repeat(64), patches: [{ from: 0, to: 1, insert: 'x' }] });
}
if (category === 'rdf-gate') {
  const t = (s: string, o: string) => ({
    s: { termType: 'NamedNode', value: s },
    p: { termType: 'NamedNode', value: 'https://e/p' },
    o: { termType: 'Literal', value: o },
  });
  assert.equal(
    m.gate(
      [t('https://e/a', '1'), t('https://e/b', '2')],
      [t('https://e/a', '9'), t('https://e/b', '2')],
      ['https://e/a'],
    ).ok,
    true,
  );
  assert.equal(
    m.gate(
      [t('https://e/a', '1'), t('https://e/b', '2')],
      [t('https://e/a', '9'), t('https://e/b', '3')],
      ['https://e/a'],
    ).ok,
    false,
  );
}
if (category === 'rdf-lines') {
  const { applyPatches } = await import('../src/shared/editor/patch');
  const src = '<https://e/a> <https://e/p> "1" .\n<https://e/b>   <https://e/p>  "2" .   # kept\n';
  const out = applyPatches(
    src,
    m.ntPatches(
      src,
      m.readLines(src),
      'https://e/a',
      new Set(),
      new Map([[0, '<https://e/a> <https://e/p> "9" .']]),
      [],
      '\n',
    ),
  );
  assert.equal(out, src.replace('"1"', '"9"'));
}
if (category === 'scm-block') {
  const e = (path: string) => ({
    path,
    index: '.',
    worktree: 'M',
    conflicted: false,
    untracked: false,
  });
  assert.equal(m.blockers(['a.yaml'], [])?.reason, 'drafts');
  assert.deepEqual(m.blockers(['a.yaml'], [])?.paths, ['a.yaml']);
  assert.equal(m.blockers([], [e('b.yaml')])?.reason, 'dirty');
  assert.equal(m.blockers([], []), null);
}
if (category === 'git-exec') {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-mutations-git-'));
  const dir = path.join(root, 'p');
  fs.mkdirSync(dir);
  try {
    const git = m.createGit({
      projectsRoot: root,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'),
        GIT_CONFIG_NOSYSTEM: '1',
      },
    });
    fs.writeFileSync(
      path.join(root, 'gitconfig'),
      '[user]\n\tname = T\n\temail = t@example.invalid\n',
    );
    await git.init(dir);
    // Arguments reach Git literally: no shell splits or runs them.
    const r = await git.run(dir, ['-c', 'user.name=a b; touch PWNED', 'config', 'user.name']);
    assert.equal(r.stdout, 'a b; touch PWNED\n');
    assert(!fs.existsSync(path.join(dir, 'PWNED')));
    // Remote commands only from the explicit actions.
    for (const args of [['fetch'], ['push'], ['pull']])
      await assert.rejects(git.run(dir, args), /explicit/);
    // No commit without a message.
    fs.writeFileSync(path.join(dir, 'a.yaml'), 'a: 1\n');
    await git.addAll(dir);
    await assert.rejects(
      git.commit(dir, '  '),
      (e: any) => e.message === 'A commit message is required.',
    );
    assert.equal(await git.head(dir), null);
    await git.commit(dir, 'ok');
    assert(await git.head(dir));
    // CommitPaths: only the listed paths; other staged work stays staged.
    fs.writeFileSync(path.join(dir, 'a.yaml'), 'a: 2\n');
    fs.writeFileSync(path.join(dir, 'b.yaml'), 'b: 1\n');
    await git.run(dir, ['add', 'b.yaml']);
    fs.writeFileSync(path.join(dir, 'c.yaml'), 'c: 1\n');
    const out = await git.commitPaths(dir, ['a.yaml', 'c.yaml'], 'Only a and c');
    assert.equal(out.committed, true);
    assert.deepEqual(
      (await git.run(dir, ['show', '--name-only', '--format=', 'HEAD'])).stdout
        .trim()
        .split('\n')
        .sort(),
      ['a.yaml', 'c.yaml'],
    );
    assert.equal((await git.run(dir, ['status', '--porcelain'])).stdout.trim(), 'A  b.yaml');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
if (category === 'odcs-diff') {
  const v = (t: string, p = 'VARCHAR') => ({
    schema: [{ name: 'o', properties: [{ name: 'a', logicalType: t, physicalType: p }] }],
  });
  assert.deepEqual(m.diffObject(v('string'), v('integer'), 'o')?.properties[0]?.changes, [
    { attribute: 'logicalType', before: 'string', after: 'integer' },
  ]);
  assert.deepEqual(m.diffObject(v('string'), v('string', 'TEXT'), 'o')?.properties[0]?.changes, [
    { attribute: 'physicalType', before: 'VARCHAR', after: 'TEXT' },
  ]);
  assert.equal(m.diffObject(v('string'), v('string'), 'o'), null);
}
if (category === 'fullscreen') {
  const m1 = m.createViewMemory();
  assert.equal(m1.exit(), null);
  m1.enter({ x: 10, y: -5, zoom: 0.4 });
  assert.equal(m1.pending, true);
  assert.deepEqual(m1.exit(), { x: 10, y: -5, zoom: 0.4 });
  assert.equal(m1.exit(), null);
}

if (category === 'autosave') {
  let s = m.initialAutosave;
  const step = (e: any) => {
    const r = m.autosave(s, e);
    s = r.state;
    return r.effect;
  };
  step({ type: 'open', file: 'f', hash: 'h0', text: 'a' });
  step({ type: 'edit', text: 'broken' });
  assert.equal(step({ type: 'idle', text: 'broken', errors: 2 }), null);
  assert.equal(s.status, 'invalid');
  step({ type: 'edit', text: 'ok' });
  assert.equal(step({ type: 'idle', text: 'ok', errors: 0 }).type, 'save');
  step({ type: 'stale' });
  step({ type: 'edit', text: 'ok2' });
  assert.equal(step({ type: 'idle', text: 'ok2', errors: 0 }), null);
  assert.equal(s.status, 'stale');
}
if (category === 'lineage') {
  const files = [
    {
      path: 'c.odcs.yaml',
      data: {
        schema: [
          { name: 'p', physicalName: 'db.p', properties: [{ name: 'id' }] },
          {
            name: 'ch',
            physicalName: 'db.ch',
            properties: [{ name: 'pid', relationships: [{ to: 'p.id' }] }, { name: 'v' }],
          },
          { name: 'chx', physicalName: 'db.chx', properties: [{ name: 'v' }] },
        ],
      },
    },
    {
      path: 's.yaml',
      data: {
        name: 'S',
        datasets: [{ name: 'd', source: 'db.ch', fields: [{ name: 'pid' }, { name: 'v' }] }],
        metrics: [
          {
            name: 'm',
            expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'SUM(d.v)' }] },
          },
        ],
      },
    },
  ];
  const g = m.buildLineage(files, 'c.odcs.yaml');
  // Foreign key: referenced (parent) column → referencing column.
  assert.deepEqual(
    g.edges.filter((e: any) => e.kind === 'foreign-key').map((e: any) => [e.from, e.to]),
    [['object:c.odcs.yaml#p/id', 'object:c.odcs.yaml#ch/pid']],
  );
  // The dataset reads `db.ch` only, never the similarly named `db.chx`.
  assert.deepEqual(
    g.edges
      .filter((e: any) => e.kind === 'reads')
      .map((e: any) => e.from)
      .sort(),
    ['object:c.odcs.yaml#ch/pid', 'object:c.odcs.yaml#ch/v'],
  );
  // Closure direction: upstream of d.v is ch.v only, not d.pid.
  const up = m.closure(g, ['dataset:s.yaml#/d/v'], 'up');
  assert.deepEqual([...up.nodes].sort(), ['dataset:s.yaml#/d/v', 'object:c.odcs.yaml#ch/v']);
  const down = m.closure(g, ['object:c.odcs.yaml#p/id'], 'down');
  assert(!down.nodes.has('object:c.odcs.yaml#ch/v'));
  // An edge to a column that is not shown attaches to the "more" row.
  const card = {
    id: 'k',
    kind: 'object',
    label: 'k',
    file: '',
    columns: Array.from({ length: 12 }, (_, i) => ({ id: `k/c${i}`, path: `c${i}`, badges: [] })),
  };
  assert.equal(
    m.cardRows(card, { focus: new Set(), connected: new Set() }).port('k/c11'),
    m.moreRowId('k'),
  );
}
if (category === 'mapping-graph') {
  const { buildContext, agentCatalog } = await import(
    new URL('../src/server/agent/runtime.ts', import.meta.url).href
  );
  const { readFileSync } = await import('node:fs');
  const dir = new URL('../public/examples/commerce/', import.meta.url).pathname;
  const docs = (edit: (f: string, s: string) => string = (_f, s) => s) =>
    ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml'].map(
      (f, i) => ({
        id: 'p/' + f,
        filename: f,
        source: edit(f, readFileSync(dir + f, 'utf8')),
        revision: i + 1,
        project: 'p',
      }),
    );
  const ctx = (d: any[]) => buildContext(d, agentCatalog(d).mappings[0].id);
  const g = m.buildMappingGraph(ctx(docs()));
  // Link Order.customer passes through the join fields.
  assert.deepEqual(
    g.edges.find((e: any) => e.kind === 'link' && e.from === 'concept:Order/customer').via,
    ['dataset:orders/customer_id', 'dataset:customers/customer_id'],
  );
  // A field nothing reads is unmapped, a mapped one is not.
  const g2 = m.buildMappingGraph(
    ctx(
      docs((f, s) =>
        f === 'commerce.mapped-semantic.yaml'
          ? s.replace(
              '    fields:\n',
              '    fields:\n      - {name: notes, expression: {dialects: [{dialect: ANSI_SQL, expression: notes}]}}\n',
            )
          : s,
      ),
    ),
  );
  const orders = g2.cards.get('dataset:orders');
  assert(
    orders.columns
      .find((c: any) => c.path === 'notes')
      .badges.some((b: any) => b.label === 'Unmapped'),
  );
  assert(
    !orders.columns
      .find((c: any) => c.path === 'order_id')
      .badges.some((b: any) => b.label === 'Unmapped'),
  );
  // A finding sits on the concept mapping it comes from.
  const g3 = m.buildMappingGraph(
    ctx(
      docs((f, s) =>
        f === 'commerce.mapping.yaml'
          ? s.replace(
              '            - relationship: id\n              expression: orders.order_id',
              '            - relationship: id\n              expression: orders.no_such_field',
            )
          : s,
      ),
    ),
  );
  assert((g3.cards.get('concept:Order').findings ?? []).join().includes('no_such_field'));
  assert.deepEqual(g3.cards.get('concept:Revenue').findings ?? [], []);
  // A KPI binding's `of` is dashed `of`, not `measures`.
  const g4 = m.buildMappingGraph(
    ctx(
      docs((f, s) =>
        f === 'commerce.mapping.yaml'
          ? s.slice(0, s.indexOf('custom_extensions:')) +
            'custom_extensions:\n  - vendor_name: SEMANTIC_WORKBENCH\n    data: \'{"schema": "semantic-workbench/mapping/v1", "kpi_bindings": [{"metric":"gross_revenue","measures":"Revenue","of":"Customer"}]}\'\n'
          : s,
      ),
    ),
  );
  assert.deepEqual(
    g4.edges
      .filter((e: any) => e.to === 'metric:gross_revenue' && e.kind !== 'object')
      .map((e: any) => [e.kind, e.from])
      .sort(),
    [
      ['measures', 'concept:Revenue'],
      ['of', 'concept:Customer'],
    ],
  );
}
if (category === 'expansion') {
  const edges = [
    ['C', 'A'],
    ['C', 'B'],
    ['A', 'X'],
    ['B', 'X'],
    ['A', 'Z'],
  ].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t, label: 'r' }));
  const ex = (from: string) => {
    const n = m.neighbours(edges, from, 'both');
    return m.registerSet({
      kind: 'expand',
      from,
      direction: 'both',
      nodes: n.nodes,
      edges: n.edges,
      frontier: {},
      total: 0,
      budget: 0,
    });
  };
  const base = ['C', 'A', 'B'];
  const a = ex('A');
  const b = ex('B');
  const ca = m.registerSet({
    kind: 'collapse',
    from: 'A',
    target: a.id,
    direction: 'both',
    nodes: [],
    edges: [],
    frontier: {},
    total: 0,
    budget: 0,
  });
  // X is reached by B too: collapsing A keeps it, removes Z.
  assert.deepEqual(m.canvasOf(base, [a, b, ca]).nodes.sort(), ['A', 'B', 'C', 'X']);
}
if (category === 'incremental') {
  const pos = new Map([
    ['O', { x: 0, y: 0 }],
    ['k', { x: -50, y: 999 }],
  ]);
  const out = m.placeNew(
    pos,
    'O',
    [
      { id: 'k', side: 1 },
      { id: 'n', side: 1 },
    ],
    { column: 360, row: 130 },
  );
  assert.deepEqual(out.get('k'), { x: -50, y: 999 });
  assert.deepEqual(out.get('n'), { x: 360, y: 0 });
}
if (category === 'pierce') {
  const nodes = Array.from({ length: 30 }, (_, i) => ({
    id: 'n' + i,
    name: 'n' + i,
    kind: 'EntityType',
  }));
  const edges = nodes
    .slice(1)
    .map((n, i) => ({ id: 'e' + i, source: 'n' + i, target: n.id, label: 'next' }));
  const o = { direction: 'out', valueTypes: true, technical: true, metrics: true, budget: 10 };
  const r = m.boundedClosure(nodes, edges, ['n0'], o);
  assert.equal(r.nodes.length, 10);
  assert.equal(r.total, 30);
  assert.equal(r.hidden, 20);
  // Outgoing from the middle never reaches the start of the chain.
  const mid = m.boundedClosure(nodes, edges, ['n15'], { ...o, budget: 100 });
  assert(!mid.nodes.includes('n14'));
  assert(mid.nodes.includes('n29'));
}
if (category === 'sql-regions') {
  const { readFileSync } = await import('node:fs');
  const root = process.cwd();
  const json = readFileSync(root + '/tests/fixtures/sql/escaped.semantic.json', 'utf8');
  const r = m.sqlRegions(json, 'escaped.semantic.json')[2];
  assert(r.exact);
  const at = r.offsets[r.value.indexOf('"x"')];
  assert.deepEqual(m.lineColumn(json, at), { line: 15, column: 143 });
  const dax = m.sqlRegions(
    readFileSync(root + '/tests/fixtures/sql/dax.ossie.yaml', 'utf8'),
    'dax.ossie.yaml',
  );
  assert.deepEqual(
    dax.map((x: any) => x.grammar),
    ['postgresql', null, 'postgresql'],
  );
  const folded = m.sqlRegions(
    readFileSync(root + '/tests/fixtures/sql/folded.ossie.yaml', 'utf8'),
    'folded.ossie.yaml',
  );
  assert.equal(folded[1].grammar, 'snowflake');
  const flights = m.sqlRegions(
    readFileSync(root + '/public/examples/ossie/flights.yaml', 'utf8'),
    'flights.yaml',
  );
  assert(
    flights.some((x: any) => x.pointer.startsWith('/ontology_mappings/0/semantic_model/datasets/')),
  );
}
if (category === 'sql-lint') {
  const { readFileSync } = await import('node:fs');
  const { Parser } = await import('node-sql-parser');
  const p = new Parser();
  const src = readFileSync(
    process.cwd() + '/tests/fixtures/sql/case-when-broken.ossie.yaml',
    'utf8',
  );
  const f = m.lintSql(src, 'case-when-broken.ossie.yaml', (sql: string, g: string) => {
    p.astify(sql, { database: g });
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
  assert.deepEqual([f[0].line, f[0].column], [23, 77]);
}

if (category === 'git-setup') {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-mutations-setup-'));
  const projects = path.join(root, 'projects');
  const globalConfig = path.join(root, 'gitconfig');
  fs.mkdirSync(projects);
  fs.writeFileSync(globalConfig, '[init]\n\tdefaultBranch = main\n');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
  const sh = (cwd: string, args: string[]) => {
    const result = Bun.spawnSync(['git', ...args], { cwd, env });
    assert.equal(result.exitCode, 0, result.stderr.toString());
    return result.stdout.toString();
  };
  try {
    const git = m.createGit({ projectsRoot: projects, env });
    // The identity goes into the repository, never into the user's global configuration.
    const repo = path.join(projects, 'repo');
    fs.mkdirSync(repo);
    await git.init(repo);
    await git.setIdentity(repo, 'Ana', 'ana@example.org');
    assert.equal(sh(repo, ['config', '--local', 'user.name']).trim(), 'Ana');
    assert.equal(fs.readFileSync(globalConfig, 'utf8'), '[init]\n\tdefaultBranch = main\n');
    // A clone runs from the explicit clone action and checks links out as plain files.
    const work = path.join(root, 'work');
    sh(root, ['init', '-q', '-b', 'main', work]);
    sh(work, ['config', 'user.name', 'T']);
    sh(work, ['config', 'user.email', 't@example.invalid']);
    fs.symlinkSync('/etc/hostname', path.join(work, 'link.yaml'));
    sh(work, ['add', '.']);
    sh(work, ['commit', '-qm', 'Link']);
    const staging = path.join(projects, '.staging-clone-test');
    fs.mkdirSync(staging);
    await git.clone(staging, work, 'team');
    assert.equal(fs.lstatSync(path.join(staging, 'team', 'link.yaml')).isSymbolicLink(), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (category === 'clone') {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-mutations-clone-'));
  const layout = { root, projects: path.join(root, 'projects'), state: path.join(root, 'state') };
  fs.mkdirSync(layout.projects);
  fs.mkdirSync(layout.state);
  const parents: string[] = [];
  const events: any[] = [];
  try {
    const cloner = m.createCloner({
      layout,
      git: {
        clone: async (parent: string, _url: string, folder: string) => {
          parents.push(parent);
          fs.mkdirSync(path.join(parent, folder), { recursive: true });
        },
        cancel: () => false,
        head: async () => null,
      },
      journal: { newId: () => 'op1', run: () => {} },
      projects: () => [],
      lock: async (_key: string, run: () => unknown) => run(),
      registrySteps: () => [],
      scan: async () => {},
      invalidFiles: () => [],
      definitionCount: () => 0,
      added: () => {},
      afterClone: async () => ({}),
      emit: (event: any) => events.push(event),
    });
    cloner.start('/tmp/team.git');
    for (let tries = 0; tries < 100 && !events.some(e => e.phase === 'done'); tries++)
      await Bun.sleep(10);
    // The clone is staged inside data/projects/, nowhere else in the data folder.
    assert.equal(parents.length, 1);
    assert(parents[0].startsWith(layout.projects + path.sep), parents[0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
if (category === 'manifest') {
  const manifest = (path: string) =>
    JSON.stringify({ schema: 'semantic-workbench/repository/v1', projects: [{ path }] });
  assert.deepEqual(m.parseManifest(manifest('domains/sales')), [{ path: 'domains/sales' }]);
  // A manifest comes from a cloned repository, so its folders must stay inside it.
  for (const path of ['../outside', 'domains/../../outside', '.git/hooks', '/etc'])
    assert.throws(() => m.parseManifest(manifest(path)), path);
}
// A repository with two subprojects, Sales and Finance, in a temporary workspace.
async function teamRepositoryWorkspace() {
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const { openWorkspace } = await import('../src/server/projects/workspace');
  const d = tempDataDir();
  const ws = await openWorkspace({ root: d.root });
  const text = (name: string) =>
    `name: ${name}\nontology: [{concept: ${name}, type: EntityType}]\n`;
  await ws.importBatch(
    {
      name: 'team',
      files: [
        { path: 'domains/sales/sales.yaml', source: text('Sales') },
        { path: 'domains/finance/finance.yaml', source: text('Finance') },
      ],
    },
    LOCAL_READER,
  );
  const registered = await ws.registerRepositoryProjects('team', [
    { path: 'domains/sales', name: 'Sales' },
    { path: 'domains/finance', name: 'Finance' },
  ]);
  const [sales, finance] = registered.projects.map((project: { slug: string }) => project.slug);
  const dispose = () => {
    ws.close();
    d.cleanup();
  };
  return { ws, root: d.root, sales, finance, dispose };
}
if (category === 'subproject-trash') {
  const fs = await import('node:fs');
  const { join } = await import('node:path');
  const team = await teamRepositoryWorkspace();
  const { ws } = team;
  try {
    const trash = m.createTrash({
      layout: ws.layout,
      state: ws.state,
      journal: ws.journal,
      lock: ws.lock,
      projects: () => ws.state.registry().projects,
      registrySteps: ws.registrySteps,
      afterFiles: async () => {},
      forgetProject: () => {},
      adoptProject: async () => {},
      createProject: async () => {
        throw Error('unused');
      },
      emit: () => {},
      withCurrentReaders: (_event: string, tags: object) => tags,
    });
    await trash.deleteProject(team.sales);
    // Deleting one subproject moves its own folder and leaves the sibling and the history alone.
    const repo = join(team.root, 'projects', 'team');
    assert(!fs.existsSync(join(repo, 'domains/sales')));
    assert(fs.existsSync(join(repo, 'domains/finance/finance.yaml')));
    assert(fs.existsSync(join(repo, '.git')));
  } finally {
    team.dispose();
  }
}
if (category === 'subproject-rescan') {
  const fs = await import('node:fs');
  const { join } = await import('node:path');
  const team = await teamRepositoryWorkspace();
  const { ws } = team;
  const rescanned: string[] = [];
  try {
    const scm = m.createScm({
      layout: ws.layout,
      git: ws.git,
      gitAvailable: true,
      siblings: () => [team.sales, team.finance],
      project: () => ({}),
      drafts: () => [],
      rescan: async (slug: string) => rescanned.push(slug),
      emit: () => {},
    });
    const financeFile = join(team.root, 'projects/team/domains/finance/finance.yaml');
    fs.appendFileSync(financeFile, '# note\n');
    await scm.stageAll(team.sales, true);
    // A Git action changes the whole repository, so every project in it rescans.
    assert.deepEqual(rescanned.sort(), [team.finance, team.sales].sort());
  } finally {
    team.dispose();
  }
}

if (category === 'auth-grants') {
  const principal = {
    id: 'person',
    groups: [],
    groupsResolved: 'token',
    verifiedEmail: 'A@Example.org',
  };
  const options = { bootstrap: { emails: [], ids: [] }, deactivated: [], groupMatch: 'exact' };
  const grant = {
    id: 'email',
    roleId: 'viewer',
    member: { kind: 'email', email: 'a@example.org' },
    scope: { kind: 'workspace' },
  };
  assert.equal(m.resolveGrants(principal, [grant], options).length, 1);
  const projects = [
    { slug: 'sales', domain: 'sales' },
    { slug: 'hr', domain: 'hr' },
    { slug: 'lab', domain: null },
  ];
  assert.deepEqual(m.holdersOfGrant(grant, projects), [
    'viewer@workspace',
    'viewer@sales',
    'viewer@hr',
  ]);
  assert.deepEqual(
    m.holdersOfGrant({ ...grant, scope: { kind: 'domains', domains: ['sales'] } }, projects),
    ['viewer@sales'],
  );
}
if (category === 'auth-principal') {
  const mapping = { provider: 'generic', groupClaim: 'groups', tenantId: null };
  const claims = {
    iss: 'issuer',
    sub: 'person',
    email: 'person@example.org',
    email_verified: false,
    groups: [],
    roles: ['admin'],
  };
  const person = m.normalizeClaims(claims, mapping);
  assert.equal(person.verifiedEmail, null);
  assert.deepEqual(person.groups, []);
  const guest = m.normalizeClaims(
    { tid: 'tenant', oid: 'object', upn: 'guest#EXT#@tenant.org' },
    { ...mapping, provider: 'entra' },
  );
  assert.equal(guest.verifiedEmail, null);
  // A verified e-mail claim never names a guest either; this does not pass through the user name.
  const guestEmail = m.normalizeClaims(
    { tid: 'tenant', oid: 'object', email: 'guest#EXT#@tenant.org', xms_edov: true },
    { ...mapping, provider: 'entra' },
  );
  assert.equal(guestEmail.verifiedEmail, null);
}
if (category === 'auth-compiler') {
  const role = {
    id: 'r_reader',
    name: 'Reader',
    description: '',
    permissions: [{ actions: ['read'], conditions: { path: 'public/*' } }],
  };
  assert.match(
    m.compileRoles([role]).policies['role:r_reader:1'],
    /resource\.path like "public\/\*"/,
  );
  assert.throws(() => m.validateCustomRole({ ...role, permissions: [{ actions: ['admin'] }] }));
}
if (category === 'auth-decision') {
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const access = m.createAccessControl(accessFixture());
  const alice = access.principalFor(person('alice'));
  assert.equal(
    access.authorize(alice, 'read', { type: 'project', project: 'hr-people' }).status,
    404,
  );
  const erin = access.principalFor(person('erin'));
  assert.equal(access.authorize(erin, 'read', { type: 'workspace' }).allow, false);
  const options = accessFixture();
  options.config.adminRules = {
    invalid: 'permit(principal, action, resource) when { resource.missing };',
  };
  assert.throws(() => m.createAccessControl(options));
}
if (category === 'auth-admin-guard') {
  const { emptyAccessConfig } = await import('../src/server/auth/access-config');
  assert.deepEqual(
    m.checkLastAdmin(emptyAccessConfig(), {
      users: [],
      bootstrap: { emails: [], ids: [] },
      sessionLifetimeHours: 24,
      now: new Date(),
    }),
    { ok: false, reason: 'last-admin' },
  );
}
if (category === 'auth-middleware') {
  const { testWorkspace } = await import('../tests/helpers/temp-data-dir');
  const { localPrincipal } = await import('../src/server/auth/principal');
  const { createAuditLog } = await import('../src/server/auth/audit');
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: workspace.root + '/audit' });
  const handler = m.createAccessMiddleware(
    workspace.ws,
    { audit, principal: () => ({ ...localPrincipal(), kind: 'person', id: 'nobody', grants: [] }) },
    () => null,
    async () => {
      throw new Error('Denied requests must not run routes');
    },
  );
  const response = await handler(new Request('http://localhost/api/projects'));
  assert.equal(response.status, 403);
  assert.equal(audit.entries(new Date().toISOString().slice(0, 7)).length, 1);
}

if (category === 'auth-admin-repo') {
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const dir = tempDataDir();
  try {
    const repo = m.openAdminRepository({ root: dir.root });
    const author = { name: 'Admin', email: 'admin@example.org' };
    await repo.ensure();
    const first = await repo.version();
    const files = { 'grants.json': '{"grants":[]}' };
    const current = await repo.write(files, {
      author,
      baseVersion: first,
      message: 'grants: Save',
    });
    await assert.rejects(
      repo.write(files, {
        author,
        baseVersion: first,
        message: 'grants: Stale',
      }),
      /stale/,
    );
    await assert.rejects(
      repo.write(files, {
        author: { ...author, name: 'Injected <>' },
        baseVersion: current,
        message: 'grants: Invalid author',
      }),
      /Invalid administrator/,
    );
    assert.equal(await repo.version(), current);
  } finally {
    dir.cleanup();
  }
}

if (category === 'auth-audit') {
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const dir = tempDataDir();
  try {
    const audit = m.createAuditLog({ dir: dir.root });
    audit.append({
      requestId: 'request',
      principal: { id: 'local', kind: 'local' },
      action: 'read',
      resource: { type: 'file', text: 'private content', token: 'secret' },
      decision: 'allow',
      rules: [],
    });
    const entry = audit.entries(new Date().toISOString().slice(0, 7))[0];
    assert.equal(Object.hasOwn(entry.resource, 'text'), false);
    assert.equal(Object.hasOwn(entry.resource, 'token'), false);
  } finally {
    dir.cleanup();
  }
}

if (category === 'auth-middleware') {
  const { testWorkspace } = await import('../tests/helpers/temp-data-dir');
  const { createAuditLog } = await import('../src/server/auth/audit');
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: workspace.root + '/audit-allowed' });
  let calls = 0;
  const run = async () => {
    calls++;
    return new Response('ran');
  };
  const handler = m.createAccessMiddleware(workspace.ws, { audit }, () => null, run);
  assert.equal((await handler(new Request('http://localhost/api/unmapped'))).status, 404);
  assert.equal(calls, 0);
  assert.equal((await handler(new Request('http://localhost/api/agent/catalog'))).status, 200);
  assert.equal(audit.entries(new Date().toISOString().slice(0, 7)).length, 1);
  const server = m.createAccessMiddleware(workspace.ws, { mode: 'server', audit }, () => null, run);
  assert.equal(
    (
      await server(
        new Request('http://localhost/api/projects', {
          method: 'POST',
          headers: { Origin: 'https://workbench.example', 'X-SW-Request': '1' },
        }),
      )
    ).status,
    403,
  );
  assert.equal(calls, 1);
}

if (category === 'container-health') {
  const health = m.healthResponse(new Request('http://localhost/healthz'), 'serving', {});
  assert.deepEqual(await health.json(), {
    ok: true,
    version: null,
    commit: null,
    telemetry: { enabled: false, reason: 'not-started' },
  });
  const response = m.healthResponse(new Request('http://localhost/api/projects'), 'handover', {});
  assert.equal(response?.status, 503);
  assert.equal(response.headers.get('Retry-After'), '10');
}
if (category === 'container-lock') {
  let current: any = {
    host: 'old',
    pid: 2,
    revision: 'old',
    heartbeat: new Date(0).toISOString(),
    state: 'serving',
  };
  assert.equal(m.lockDecision(current, 0, 'old'), 'refuse');
  let opened = 0;
  let writes = 0;
  let finish!: () => void;
  let now = 0;
  const lock = m.createInstanceLock({
    host: 'new',
    pid: 1,
    revision: 'new',
    now: () => now,
    files: {
      read: () => current,
      claim: (value: any) => {
        current = value;
        writes++;
        return true;
      },
      write: (value: any) => {
        current = value;
        writes++;
      },
      remove: () => {
        current = null;
      },
    },
    open: () => {
      opened++;
      if (current?.host !== 'new') throw Error('Recovery before lock acquisition');
      return new Promise<void>(resolve => {
        finish = resolve;
      });
    },
    log: () => {},
  });
  await lock.tick();
  assert.equal(lock.state, 'handover');
  assert.equal(opened, 0);
  assert.equal(writes, 0);
  current = null;
  now = 10_000;
  const opening = lock.tick();
  assert.equal(lock.state, 'starting');
  finish();
  await opening;
  assert.equal(lock.state, 'serving');
  await lock.close();
}

if (category === 'pipeline-script') {
  assert.throws(() => m.checkScript('bun run nonexistent', { check: 'tsc' }));
  m.checkScript('bun run check', { check: 'tsc' });
}
if (category === 'pipeline-provider') {
  const input = m.readPipelineInput();
  m.lintRules(input);
  input.files['azure-pipelines.yml'] += '\n# Keycloak is forbidden even in comments\n';
  assert.throws(() => m.lintRules(input), /Keycloak/);
}
if (category === 'signin-sessions') {
  assert.match(m.sessionCookie('opaque', 'https://workbench.example'), /; HttpOnly;/);
  assert.match(m.sessionCookie('opaque', 'https://workbench.example'), /; Secure;/);
  assert.equal(m.sessionExpired({ createdAt: 0, lastSeenAt: 23 }, 24, 8, 24), true);
}
if (category === 'signin-csrf') {
  const request = new Request('https://workbench.example/api/projects', {
    method: 'POST',
    headers: { Origin: 'https://workbench.example' },
  });
  assert.equal(await m.validCsrf(request, 'https://workbench.example'), false);
}
if (category === 'signin-nonce') {
  const { oidcTransport } = await import('../tests/helpers/oidc-transport');
  const transport = await oidcTransport();
  const client = await m.createOidcClient(transport.config, { fetch: transport.fetch });
  const started = await client.login('/');
  const result = await client.callback(transport.authorize(started.url), started.attempt);
  assert(result.principal.id);
  const bad = await client.login('/');
  await assert.rejects(
    client.callback(transport.authorize(bad.url), {
      ...bad.attempt,
      nonce: 'wrong',
    }),
  );
}
if (category === 'signin-tenant') {
  assert.throws(() =>
    m.normalizeClaims(
      { tid: 'foreign', oid: 'person' },
      {
        provider: 'entra',
        tenantId: 'expected',
        groupClaim: 'groups',
      },
    ),
  );
}
if (category === 'signin-directory') {
  const directory = m.createDirectoryClient({
    graphUrl: 'http://127.0.0.1/graph',
    token: async () => 'token',
    fetch: async () => new Response('', { status: 503 }),
  });
  assert.equal(await directory.groups('person', ['grant-group']), null);
}
if (category === 'signin-pages') {
  const { localPrincipal } = await import('../src/server/auth/principal');
  const page = await m.authPage('no-access', { principal: localPrincipal(), csrf: 'token' }).text();
  assert.doesNotMatch(page, /workspace-data|projects|files|count/);
  const route = m.createAuthRoutes({
    session: async () => null,
    login: async () =>
      new Response(null, { status: 302, headers: { Location: 'https://provider' } }),
  });
  const signedOut = await route(new Request('https://workbench.example/auth/signed-out'));
  assert.equal(signedOut.status, 200);
  assert.equal(signedOut.headers.get('location'), null);
}
if (category === 'signin-redirect') {
  const { testWorkspace } = await import('../tests/helpers/temp-data-dir');
  using workspace = await testWorkspace();
  const boundary = m.createAccessMiddleware(
    workspace.ws,
    {
      mode: 'server',
      authentication: {
        login: async () =>
          new Response(null, {
            status: 302,
            headers: { Location: 'https://provider/authorize' },
          }),
      },
    },
    () => null,
    async () => new Response('workspace'),
  );
  const response = await boundary(new Request('https://workbench.example/catalog'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://provider/authorize');
}
if (category === 'signin-config') {
  const { TEST_TENANT_ID } = await import('../tests/helpers/auth-identities');
  const env = {
    SW_MODE: 'server',
    SW_PUBLIC_URL: 'https://workbench.example',
    SW_OIDC_ISSUER: `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`,
    SW_OIDC_CLIENT_ID: 'client',
    SW_OIDC_CLIENT_SECRET: 'secret',
    SW_OIDC_PROVIDER: 'entra',
    SW_ENTRA_TENANT_ID: TEST_TENANT_ID,
    SW_SESSION_KEY: Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString(
      'base64',
    ),
    SW_BOOTSTRAP_ADMINS: 'admin@example.org',
  };
  assert.equal(m.readConfig(env).mode, 'server');
  // A generic provider, so the Entra host rule cannot hide the plain-http rule.
  const generic = { ...env, SW_OIDC_PROVIDER: 'generic' };
  assert.equal(
    m.readConfig({ ...generic, SW_OIDC_ISSUER: 'https://provider.example' }).mode,
    'server',
  );
  assert.throws(() => m.readConfig({ ...generic, SW_OIDC_ISSUER: 'http://provider.example' }));
  assert.throws(() => m.readConfig({ ...env, SW_GRAPH_URL: 'https://attacker.example' }));
}

if (category === 'deploy-version') {
  assert.throws(() => m.checkReleaseVersion('v0.4.0', '0.4.0', ['v0.5.0']));
}
if (category === 'deploy-preflight') {
  const { fakeApp, fakeTarget } = await import('./deploy-fake');
  const app = fakeApp();
  app.maxReplicas = 2;
  assert.throws(() => m.preflight(app, fakeTarget));
}
if (category === 'deploy-recovery') {
  const { fakeAzure, fakeTarget, fakeRelease } = await import('./deploy-fake');
  const client = fakeAzure({ failSmoke: true });
  await assert.rejects(() => m.deploy(fakeTarget, fakeRelease, client));
  assert(client.calls.some(call => call[0] === 'copy'));
}
if (category === 'deploy-smoke') {
  const expected = { version: '0.4.0', commit: 'a'.repeat(40) };
  const endpoint = 'https://provider.example/authorize';
  const headers = {
    location: endpoint + '?code_challenge_method=S256',
    'strict-transport-security': 'max-age=31536000',
    'content-security-policy': "default-src 'self'",
    'x-content-type-options': 'nosniff',
    'set-cookie': '__Host-sw-auth=attempt; Secure; HttpOnly; Path=/',
  };
  const input = {
    ready: { status: 200, body: { ready: true, state: 'serving' } },
    health: { status: 200, body: { ...expected } },
    projects: { status: 401, body: { error: 'Unauthorized' } },
    home: new Response(null, { status: 302, headers }),
    login: new Response(null, { status: 302, headers }),
  };
  assert(m.smokeChecks(input, expected, endpoint, false).every((check: any) => check.ok));
  for (const faulty of [
    { ...input, health: { status: 200, body: { ...expected, version: 'wrong' } } },
    { ...input, projects: { ...input.projects, status: 200 } },
    { ...input, ready: { status: 200, body: { ready: true, state: 'handover' } } },
  ]) {
    assert(m.smokeChecks(faulty, expected, endpoint, false).some((check: any) => !check.ok));
  }
}
if (category.startsWith('read-')) {
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const view = access.view(principal);
  if (category === 'read-events') {
    const events = m.createEvents({ suggestionIndex: () => [], sharedSuggestionCount: () => 0 });
    events.emit(
      'files',
      { project: 'hr-people', paths: ['LEAK-secret'] },
      { paths: [{ project: 'hr-people', path: 'LEAK-secret' }] },
    );
    events.emit(
      'files',
      { project: 'sales-contracts', paths: ['orders.odcs.yaml'] },
      { paths: [{ project: 'sales-contracts', path: 'orders.odcs.yaml' }] },
    );
    const response = events.stream(
      new Request('http://localhost/events', {
        headers: { 'Last-Event-ID': '0' },
      }),
      undefined,
      { scope: access.forRequest(principal), owner: principal.id },
    );
    const reader = response.body.getReader();
    await reader.read();
    assert(!new TextDecoder().decode((await reader.read()).value).includes('LEAK-'));
    events.emit(
      'files',
      { project: 'hr-people', paths: ['LEAK-secret'] },
      { paths: [{ project: 'hr-people', path: 'LEAK-secret' }] },
    );
    events.emit(
      'files',
      { project: 'sales-contracts', paths: ['orders.odcs.yaml'] },
      { paths: [{ project: 'sales-contracts', path: 'orders.odcs.yaml' }] },
    );
    assert(!new TextDecoder().decode((await reader.read()).value).includes('LEAK-'));
    await reader.cancel();
  } else if (category === 'read-trash') {
    assert(
      !m.readableTrash(
        { project: 'sales-contracts', path: 'orders.odcs.yaml', owner: 'another-person' },
        access.forRequest(principal),
      ),
    );
  } else {
    const { authWorkspace } = await import('../tests/helpers/auth-workspace');
    using fixture = await authWorkspace();
    if (category === 'read-workspace') {
      fixture.ws.close();
      const workspace = await m.openWorkspace({ root: fixture.root });
      try {
        assert(
          !JSON.stringify(workspace.documentsFor({ view, owner: principal.id })).includes(
            'LEAK-hr-',
          ),
        );
      } finally {
        workspace.close();
      }
    }
    if (category === 'read-agent') {
      const handler = m.createHandler(fixture.ws, {
        mode: 'server',
        remoteCredentials: allowEveryRemote(),
        access,
        principal: () => principal,
      });
      const response = await handler(
        new Request(
          'http://localhost/api/agent/context?project=sales-contracts&mappingId=sales-contracts/people.mapping.yaml',
        ),
      );
      assert.equal(response.status, 200);
      assert(!(await response.text()).includes('LEAK-hr-'));
    }
    if (category === 'read-drafts') {
      const { requestAccess } = await import('../src/server/auth/request-scope');
      fixture.ws.state.writeDraft('sales-contracts', 'orders.odcs.yaml', {
        baseHash: null,
        text: 'LEAK-other-owner',
        patches: [],
      });
      const request = new Request('http://localhost/api/drafts/sales-contracts/orders.odcs.yaml');
      Object.assign(request, { [requestAccess]: access.forRequest(principal) });
      const response = await m.draftRoutes(fixture.ws, request, new URL(request.url));
      assert.equal(response.status, 404);
    }
    if (category === 'read-git') {
      const { requestAccess } = await import('../src/server/auth/request-scope');
      const request = new Request(
        'http://localhost/api/projects/sales-contracts/git/show?path=finance/removed.yaml&commit=HEAD',
      );
      Object.assign(request, { [requestAccess]: access.forRequest(principal) });
      await assert.rejects(
        () => m.gitRoutes(fixture.ws, request, new URL(request.url)),
        /Not found/,
      );
    }
  }
}

if (category === 'write-targets') {
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const { requestAccess } = await import('../src/server/auth/request-scope');
  const scope = createAccessControl(accessFixture()).forRequest({
    ...person('alice'),
    grants: [],
    deactivated: false,
  });
  const request = new Request('http://localhost/api');
  Object.assign(request, { [requestAccess]: scope });
  assert.throws(() =>
    m.authorizeWrite(request, 'move', [
      { type: 'file', project: 'sales-contracts', path: 'orders.odcs.yaml' },
      { type: 'file', project: 'hr-people', path: 'orders.odcs.yaml' },
    ]),
  );
}

if (category === 'write-drafts') {
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const access = createAccessControl(accessFixture());
  const route = m.routeFor('PUT', '/api/drafts/hr-people/people.odcs.yaml');
  const resource = route.row.resource(route.match, new URL('http://localhost'));
  const decision = access.authorize(
    access.principalFor(person('carol')),
    route.row.action,
    resource,
  );
  assert.equal(decision.allow, false);
}

if (category === 'write-body-flags') {
  const paths = [
    ['POST', '/api/documents'],
    ['PUT', '/api/documents/example/grouping'],
    ['POST', '/api/suggestions/example/accept'],
    ['POST', '/api/suggestions/example/reject'],
    ['POST', '/api/trash/example/undo'],
    ['POST', '/api/trash/example/restore'],
  ];
  for (const [method, path] of paths) assert.equal(m.routeFor(method, path).row.targets, 'body');
}

if (['write-body-legacy', 'write-body-suggestions', 'write-body-trash'].includes(category)) {
  const { authWorkspace } = await import('../tests/helpers/auth-workspace');
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const { requestAccess } = await import('../src/server/auth/request-scope');
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const origin = 'http://127.0.0.1:4310';
  const request = (path: string, method = 'POST', body: unknown = {}) => {
    const result = new Request(origin + path, {
      method,
      headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
    Object.assign(result, { [requestAccess]: access.forRequest(principal) });
    return result;
  };
  if (category === 'write-body-legacy') {
    const handler = m.createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      publicOrigin: origin,
      access,
      principal: () => principal,
    });
    const id = 'hr-people/people.odcs.yaml';
    const grouping = await handler(
      request('/api/documents/' + encodeURIComponent(id) + '/grouping', 'PUT', { mode: 'types' }),
    );
    assert.equal(grouping.status, 404);
    const source = fixture.ws.readFile('hr-people', 'people.odcs.yaml');
    const document = await handler(
      request('/api/documents', 'POST', {
        id,
        filename: 'people.odcs.yaml',
        source: source.source,
        baseHash: source.hash,
      }),
    );
    assert.equal(document.status, 404);
    // An Editor elsewhere who may only view HR passes the route check; only the target check
    // refuses her save.
    const options = accessFixture();
    options.config.grants.push({
      id: 'g-alice-hr-viewer',
      roleId: 'viewer',
      member: { kind: 'email', email: 'alice@example.org' },
      scope: { kind: 'projects', projects: ['hr-people'] },
      addedBy: 'test',
      addedAt: '2026-10-22T00:00:00Z',
    } as never);
    const viewing = createAccessControl(options);
    const viewer = viewing.principalFor(person('alice'));
    const viewerHandler = m.createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      publicOrigin: origin,
      access: viewing,
      principal: () => viewer,
    });
    const viewerSave = await viewerHandler(
      request('/api/documents', 'POST', {
        id,
        filename: 'people.odcs.yaml',
        source: source.source,
        baseHash: source.hash,
      }),
    );
    assert.equal(viewerSave.status, 403);
  }
  if (category === 'write-body-suggestions') {
    fixture.ws.suggestions = () =>
      [
        {
          id: '00000000000000000000',
          file: { project: 'hr-people', path: 'people.odcs.yaml', hash: 'hidden' },
          targetProject: 'sales-contracts',
          reasons: [],
        },
      ] as never;
    for (const action of ['accept', 'reject']) {
      const req = request('/api/suggestions/00000000000000000000/' + action);
      await assert.rejects(m.suggestionRoutes(fixture.ws, req, new URL(req.url)), {
        name: 'WriteAccessError',
      });
    }
  }
  if (category === 'write-body-trash') {
    const entry = await fixture.ws.trash.deleteFile(
      'hr-people',
      'people.odcs.yaml',
      undefined,
      LOCAL_READER,
    );
    for (const action of ['undo', 'restore']) {
      const req = request('/api/trash/' + entry.entryId + '/' + action);
      await assert.rejects(m.trashRoutes(fixture.ws, req, new URL(req.url)), {
        name: 'WriteAccessError',
      });
    }
  }
}

// Admin panel decisions are checked here; every other admin- category is a server mutant.
const ADMIN_UI_CATEGORIES = new Set(['admin-review', 'admin-save']);
if (category.startsWith('sec-')) {
  const { sessionSecurityCase } = await import('./session-security-mutation-cases');
  await sessionSecurityCase(m, category);
}
if (category === 'admin-review') {
  const key = m.proposalKey({ roles: [] }, 'base');
  const result = { dryRunId: 'review', changed: [], people: [], matrixCases: 1, auditCases: 0 };
  assert(m.canConfirm({ key, result }, key));
  assert(!m.canConfirm(null, key));
  assert(!m.canConfirm({ key, result }, m.proposalKey({ roles: [] }, 'changed')));
  assert(!m.canConfirm({ key, result }, m.proposalKey({ grants: [] }, 'base')));
  assert(!m.canConfirm({ key, result: { ...result, dryRunId: '' } }, key));
}
if (category.startsWith('admin-') && !ADMIN_UI_CATEGORIES.has(category)) {
  const { adminMutationCase } = await import('./admin-mutation-cases');
  await adminMutationCase(m, category);
}
if (category.startsWith('export-')) {
  const { exportMutationCase } = await import('./export-mutation-cases');
  await exportMutationCase(m, category);
}
if (category.startsWith('theme-')) {
  const { themeMutationCase } = await import('./theme-mutation-cases');
  themeMutationCase(m, category);
}
if (category.startsWith('brand-')) {
  const { brandMutationCase } = await import('./brand-mutation-cases');
  brandMutationCase(m, category);
}
if (category.startsWith('secrev-')) {
  const { securityReviewCase } = await import('./security-review-mutation-cases');
  await securityReviewCase(m, category);
}
if (category === 'admin-save') {
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return Response.json({ version: 'saved' });
  }) as unknown as typeof fetch;
  await assert.rejects(m.adminApi.save('grants', { grants: [] }, 'base', ''));
  assert.equal(requests, 0);
}
if (category === 'bearer-scope') {
  assert(m.acceptsBearer('/api/agent/catalog'));
  for (const path of ['/api/projects', '/api/events', '/', '/auth/login', '/api/agent-other']) {
    assert.equal(m.acceptsBearer(path), false);
  }
}
if (category === 'bearer-audience') {
  const { oidcTransport } = await import('../tests/helpers/oidc-transport');
  const { SignJWT } = await import('jose');
  const transport = await oidcTransport();
  transport.config.apiAudience = [transport.state.apiAudience];
  const keysUrl = transport.state.issuer + '/keys';
  const validate = m.createBearerValidator(transport.config, keysUrl, transport.fetch);
  const key = transport.state.keys[0];
  const tokenFor = (audience: string) =>
    new SignJWT({ idtyp: 'app', azp: 'sw-agent', tid: transport.config.oidc.tenantId })
      .setProtectedHeader({ alg: 'RS256', kid: key.kid })
      .setIssuer(transport.state.issuer)
      .setAudience(audience)
      .setExpirationTime('1h')
      .sign(key.privateKey);
  const accepted = await validate('Bearer ' + (await tokenFor(transport.state.apiAudience)));
  assert.equal(accepted.clientId, 'sw-agent');
  await assert.rejects(async () => validate('Bearer ' + (await tokenFor('other'))));
}
if (category === 'bearer-grants') {
  const { emptyAccessConfig } = await import('../src/server/auth/access-config');
  const { clientFromToken } = await import('../src/server/auth/principal');
  const { loadPolicySet } = await import('../src/server/auth/cedar');
  const builtin = await import('../policies/builtin-roles.json');
  const config = emptyAccessConfig();
  config.agents.clients = [
    { clientId: 'sw-agent', name: 'Sales agent', projects: ['sales'], domains: [] },
  ];
  const policy = loadPolicySet({ builtinRoles: builtin.default.roles, customRoles: [] });
  const evaluate = m.createPolicyEvaluator(policy, {
    config,
    projects: ['sales', 'hr'],
    groupMatch: 'exact',
    roles: policy.roles,
  });
  const context = { mode: 'server', branch: '', protectedBranch: false, level: 0, guardKind: '' };
  const decide = (clientId: string, project: string) => {
    const principal = clientFromToken({ idtyp: 'app', azp: clientId }, null);
    return evaluate(principal, 'agentRead', { type: 'project', project }, context).allow;
  };
  assert.equal(decide('sw-agent', 'sales'), true);
  assert.equal(decide('sw-agent', 'hr'), false);
  assert.equal(decide('ungranted', 'sales'), false);
}
if (category === 'bearer-cookie') {
  const { testWorkspace } = await import('../tests/helpers/temp-data-dir');
  const { createAuditLog } = await import('../src/server/auth/audit');
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { clientFromToken } = await import('../src/server/auth/principal');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  using workspace = await testWorkspace();
  const origin = 'http://127.0.0.1:4444';
  const audit = createAuditLog({ dir: workspace.root + '/audit-bearer' });
  // The signed-in Admin's cookie travels with the client's token; the token must decide.
  const callWithAdminCookie = (clientId: string) => {
    const handler = m.createAccessMiddleware(
      workspace.ws,
      {
        mode: 'server',
        publicOrigin: origin,
        access: createAccessControl(accessFixture()),
        audit,
        bearer: async () => clientFromToken({ idtyp: 'app', azp: clientId }, null),
        principal: () => person('dave'),
      },
      () => null,
      async () => new Response('ran'),
    );
    const request = new Request(origin + '/api/agent/catalog', {
      headers: { Authorization: 'Bearer token' },
    });
    return handler(request);
  };
  const granted = await callWithAdminCookie('sw-agent');
  assert.equal(granted.status, 200);
  const entries = audit.entries(new Date().toISOString().slice(0, 7));
  const entry = entries.find(item => item.requestId === granted.headers.get('X-Request-Id'));
  assert.equal(entry?.principal.id, 'client:sw-agent');
  assert.equal((await callWithAdminCookie('sw-agent-ungranted')).status, 403);
}
if (category === 'bearer-delegated') {
  const app = { idtyp: 'app', azp: 'sw-agent' };
  assert.equal(m.clientFromToken(app, null).id, 'client:sw-agent');
  assert.throws(() => m.clientFromToken({ ...app, scp: 'access_as_user' }, null));
}

// Governance guards: each case fails when its guard is removed or weakened.
if (category.startsWith('guard-')) {
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const { requestAccess, requestRemote } = await import('../src/server/auth/request-scope');
  const access = createAccessControl(accessFixture());
  const fs = await import('node:fs');
  const metrics = fs.readFileSync(
    'tests/fixtures/auth-workspace/projects/sales-metrics/sales.semantic.yaml',
    'utf8',
  );
  const contract = fs.readFileSync(
    'tests/fixtures/auth-workspace/projects/sales-contracts/orders.odcs.yaml',
    'utf8',
  );
  const reclassify = (text: string) =>
    text.replace('classification: internal', 'classification: public');
  const scoped = (request: Request, name: 'alice' | 'bob') =>
    Object.assign(request, {
      [requestAccess]: access.forRequest(access.principalFor(person(name))),
      // These requests act in server mode, so remote commands need the credential service.
      [requestRemote]: allowEveryRemote(),
    });
  if (category === 'guard-decisions') {
    const guardFor = (name: 'alice' | 'bob') =>
      m.guardFor(access.forRequest(access.principalFor(person(name))));
    const own = metrics.replace(
      '"owner": "alice@example.org", "status": "proposed"',
      '"owner": "bob@example.org", "status": "approved"',
    );
    const metricChange = { project: 'sales-metrics', path: 'sales.semantic.yaml' };
    assert.throws(() => guardFor('bob')([{ ...metricChange, before: metrics, after: own }]), {
      name: 'GuardedChangeError',
    });
    const contractChange = { project: 'sales-contracts', path: 'orders.odcs.yaml' };
    const after = reclassify(contract);
    assert.throws(() => guardFor('alice')([{ ...contractChange, before: contract, after }]), {
      name: 'GuardedChangeError',
    });
  }
  if (category === 'guard-engine') {
    const settings = () => ({ aliases: {}, protectedLevel: 'confidential' as const });
    const refuseAll = () => false;
    const edited = metrics.replace("'SUM(orders.amount)'", "'SUM(orders.amount) * 2'");
    const metricChange = { project: 'sales-metrics', path: 'sales.semantic.yaml' };
    const outcome = m.applyGuards(
      [{ ...metricChange, before: metrics, after: edited }],
      settings,
      refuseAll,
      {
        demote: true,
      },
    );
    assert.equal(outcome.refused.length, 0);
    assert.equal(outcome.demoted.length, 1);
    assert(outcome.changes[0].after.includes('"status": "proposed"'));
    const kinds = m
      .guardedChanges(
        {
          project: 'sales-contracts',
          path: 'orders.odcs.yaml',
          before: contract,
          after: reclassify(contract),
        },
        settings(),
      )
      .map((change: { kind: string }) => change.kind);
    assert.deepEqual(kinds, ['classification']);
  }
  if (category === 'guard-people') {
    // Owner choices list addresses, so a Viewer must not reach them.
    assert.equal(
      m.routeFor('GET', '/api/projects/sales-metrics/people', 'server').row.action,
      'edit',
    );
  }
  if (category === 'guard-new-project') {
    const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
    const { guardFor } = await import('../src/server/auth/guards');
    const dir = tempDataDir();
    const ws = await m.openWorkspace({ root: dir.root });
    try {
      const bob = access.principalFor(person('bob'));
      const reader = {
        view: access.view(bob),
        owner: bob.id,
        guard: guardFor(access.forRequest(bob)),
      };
      const source = metrics.replace(
        '"owner": "alice@example.org", "status": "proposed"',
        '"owner": "bob@example.org", "status": "approved"',
      );
      // Bob may approve, but not a metric he owns, even in a project the import creates.
      const files = [{ path: 'sales.semantic.yaml', source }];
      await assert.rejects(ws.importBatch({ files }, reader, { domain: 'sales' }), {
        name: 'GuardedChangeError',
      });
    } finally {
      ws.close();
      dir.cleanup();
    }
  }
  const routeCategories = [
    'guard-save-batch',
    'guard-pull',
    'guard-revert',
    'guard-delete',
    'guard-restore',
    'guard-import',
    'guard-pull-default',
    'guard-publish',
  ];
  if (routeCategories.includes(category)) {
    const { readFileSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const cases = await import('../tests/auth/guard-cases');
    const { authWorkspace } = await import('../tests/helpers/auth-workspace');
    const origin = 'http://127.0.0.1:4310';
    type Sent = { method: string; path: string; body: unknown };
    const request = (item: Sent, name: 'alice' | 'bob') =>
      scoped(
        new Request(origin + item.path, {
          method: item.method,
          headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
        }),
        name,
      );
    const route = (fixture: { ws: unknown }, item: Sent, name: 'alice' | 'bob') => {
      const sent = request(item, name);
      const handle = category === 'guard-import' ? m.projectRoutes({}) : m[routeExport()];
      return handle(fixture.ws, sent, new URL(sent.url));
    };
    const routeExport = () => {
      if (category === 'guard-save-batch') return 'kpiRoutes';
      if (category === 'guard-delete' || category === 'guard-restore') return 'trashRoutes';
      return 'gitRoutes';
    };
    const refused = (fixture: { ws: unknown }, item: Sent, name: 'alice' | 'bob' = 'alice') =>
      assert.rejects(route(fixture, item, name), { name: 'GuardedChangeError' });
    using fixture = await authWorkspace();
    const saves = cases.guardedSaves(fixture.ws);
    const named = (name: string) => saves.find(item => item.name === name)!;
    if (category === 'guard-save-batch') await refused(fixture, named('save-batch'));
    if (category === 'guard-delete') await refused(fixture, cases.deleteCase());
    if (category === 'guard-import') {
      await refused(fixture, named('import with replace'));
    }
    if (category === 'guard-revert') {
      // Alice's copy holds a classification change nobody committed.
      const copy = await cases.openCopyAs(fixture.ws, 'alice');
      const contract = join(copy, 'orders.odcs.yaml');
      writeFileSync(contract, cases.reclassified(readFileSync(contract, 'utf8')));
      await refused(fixture, cases.revertCase(fixture.ws, copy));
    }
    if (category === 'guard-restore') {
      const file = 'catalog.odcs.yaml';
      const source = cases.unprotectedContract(fixture.ws);
      await fixture.ws.saveFile('sales-contracts', file, { baseHash: null, source }, LOCAL_READER);
      // Committed, so Alice's working copy starts with the contract she then deletes.
      const repository = join(fixture.root, 'projects', 'sales-contracts');
      const identity = ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.org'];
      for (const args of [
        ['add', file],
        [...identity, 'commit', '-q', '-m', 'Add catalog'],
      ])
        assert.equal(Bun.spawnSync(['git', ...args], { cwd: repository }).exitCode, 0);
      const deletion = {
        ...cases.deleteCase(),
        path: `/api/projects/sales-contracts/files/${file}`,
      };
      const deleted = await route(fixture, deletion, 'alice');
      const undo = cases.restoreCase((await deleted.json()).entryId, file);
      await refused(fixture, undo);
      await refused(fixture, { ...undo, path: undo.path.replace('/undo', '/restore') });
    }
    if (category === 'guard-pull-default')
      await refused(fixture, await cases.pullDefaultCase(fixture));
    if (category === 'guard-publish')
      await refused(fixture, await cases.publishCase(fixture), 'bob');
    if (category === 'guard-pull') {
      const remote = cases.remoteWithReclassification(fixture.ws, fixture.root);
      try {
        await fixture.ws.scm.setRemote('sales-contracts', 'origin', remote.bare);
        await refused(fixture, remote.pull);
      } finally {
        remote.dispose();
      }
    }
  }
}

// A repository with one commit, an isolated Git configuration and a bare remote beside it.
async function remoteCaseRepository(createGit: (options: object) => any) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-mutations-remote-'));
  const projects = path.join(root, 'projects');
  const repo = path.join(projects, 'repo');
  const globalConfig = path.join(root, 'gitconfig');
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(globalConfig, '[user]\n\tname = T\n\temail = t@example.invalid\n');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
  const sh = (cwd: string, args: string[]) => {
    const result = Bun.spawnSync(['git', ...args], { cwd, env });
    assert.equal(result.exitCode, 0, result.stderr.toString());
  };
  const git = createGit({ projectsRoot: projects, env });
  await git.init(repo);
  fs.writeFileSync(path.join(repo, 'a.yaml'), 'a: 1\n');
  sh(repo, ['add', '.']);
  sh(repo, ['commit', '-qm', 'First']);
  const bare = path.join(root, 'remote.git');
  sh(root, ['init', '-q', '--bare', bare]);
  return { fs, path, root, projects, repo, env, bare, sh, git };
}

if (category === 'remote-credential') {
  const setup = await remoteCaseRepository(m.createGit);
  const { fs, path, root, repo, bare, sh, git } = setup;
  const credential = {
    kind: 'token',
    username: 'person',
    token: 'SECRET-MUTATION-TOKEN',
    host: '127.0.0.1',
  };
  try {
    // The token is handed to one command and never written to the repository's configuration.
    const pushed = await git.run(repo, ['push', bare, 'main'], { remote: true, credential });
    assert.equal(pushed.code, 0);
    assert(!fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8').includes(credential.token));
    // A helper configured in the repository is never asked for, or given, a credential.
    const marker = path.join(root, 'helper-called');
    sh(repo, ['config', 'credential.helper', `!f() { echo called >> '${marker}'; }; f`]);
    const { startCredentialGitServer } = await import('../tests/auth/credential-git-server');
    const server = startCredentialGitServer(path.join(root, 'served'), async () => null);
    try {
      const url = server.repository('refused.git');
      await git.run(repo, ['push', url, 'main'], { remote: true, credential, allowFailure: true });
      assert(!fs.existsSync(marker), 'a configured credential helper was used');
    } finally {
      await server.stop();
    }
    // Output that repeats the token is masked before anyone sees it.
    const fake = path.join(root, 'fake-git');
    fs.writeFileSync(fake, '#!/bin/sh\necho "denied $SW_GIT_TOKEN" >&2\nexit 1\n', { mode: 0o755 });
    const faked = m.createGit({ projectsRoot: setup.projects, env: setup.env, binary: fake });
    const failed = await faked.run(repo, ['push', 'origin', 'main'], {
      remote: true,
      credential,
      allowFailure: true,
    });
    assert(!failed.stderr.includes(credential.token), 'the token appeared in Git output');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (category === 'remote-explicit') {
  const { fs, root, repo, bare, git } = await remoteCaseRepository(m.createGit);
  try {
    for (const args of [
      ['fetch', bare],
      ['pull', bare, 'main'],
      ['push', bare, 'main'],
    ]) {
      await assert.rejects(git.run(repo, args), /explicit/);
    }
    await assert.rejects(git.run(repo, ['clone', bare, 'copy']), /explicit/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (category === 'remote-admin') {
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const access = createAccessControl(accessFixture());
  // An Editor and a Steward each hold every other permission these rows could be mistaken for.
  for (const [method, path, username] of [
    ['PUT', '/api/projects/sales-contracts/git/remote', 'alice'],
    ['POST', '/api/clone', 'bob'],
  ] as const) {
    const route = m.routeFor(method, path);
    const resource = route.row.resource(route.match, new URL('http://localhost'));
    const principal = access.principalFor(person(username));
    assert.equal(access.authorize(principal, route.row.action, resource).allow, false, path);
  }
}

if (category === 'remote-hosts') {
  const allowed = ['github.com', '127.0.0.1:9418'];
  assert.equal(m.allowedRemoteHost('https://github.com/team/a.git', allowed).host, 'github.com');
  assert.throws(() => m.allowedRemoteHost('https://evil.example/team/a.git', allowed));
  assert.throws(() => m.allowedRemoteHost('http://github.com/team/a.git', allowed));
  assert.throws(() => m.allowedRemoteHost('https://github.com/x@evil.example/a.git', allowed));
  assert.throws(() => m.allowedRemoteHost('https://u@evil.example@github.com/a.git', allowed));
  const remote = { name: 'origin', fetchUrl: 'https://github.com/a.git' };
  assert.throws(() =>
    m.allowedRemoteAddresses({ ...remote, pushUrl: 'http://127.0.0.1:9418/a.git' }, allowed),
  );
}

// Pushes a branch through a remote that redirects at once to another host, and returns the
// passwords that other host received.
async function redirectedPasswords(args: string[], env: Record<string, string>) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const servers = await import('../tests/auth/credential-git-server');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-mutations-redirect-'));
  const elsewhere = servers.startCredentialGitServer(
    path.join(root, 'elsewhere'),
    async () => null,
  );
  const redirect = servers.startRedirectingServer(elsewhere.origin);
  try {
    const repo = path.join(root, 'repo');
    const git = (...more: string[]) => Bun.spawnSync(['git', ...more], { cwd: root });
    git('init', '-q', '-b', 'main', repo);
    fs.writeFileSync(path.join(repo, 'a.yaml'), 'a: 1\n');
    git('-C', repo, 'add', '.');
    git(
      '-C',
      repo,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-qm',
      'A',
    );
    // The servers run in this process, so Git must run without blocking it.
    const push = Bun.spawn(['git', ...args, 'push', redirect.origin + '/a.git', 'main'], {
      cwd: repo,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env, SW_GIT_HOST: redirect.host },
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await push.exited;
    return [...elsewhere.passwords];
  } finally {
    await redirect.stop();
    await elsewhere.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const REDIRECT_TOKEN = 'SECRET-REDIRECT-TOKEN';

if (category === 'remote-redirect') {
  // An askpass program that answers every prompt: only the redirect setting can stop the leak.
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-mutations-lax-'));
  const lax = path.join(dir, 'askpass');
  fs.writeFileSync(lax, `#!/bin/sh\necho ${REDIRECT_TOKEN}\n`, { mode: 0o755 });
  try {
    const credential = { kind: 'token', username: 'u', token: REDIRECT_TOKEN, host: 'unused' };
    const setup = m.credentialSetup(credential);
    const leaked = await redirectedPasswords(setup.args, { ...setup.env, GIT_ASKPASS: lax });
    assert(!leaked.includes(REDIRECT_TOKEN), 'the token followed a redirect to another host');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (category === 'askpass') {
  const askpass = process.env.ASKPASS_UNDER_TEST!;
  const env = { PATH: process.env.PATH, SW_GIT_USERNAME: 'u', SW_GIT_TOKEN: 'tok' };
  const ask = (prompt: string, host = 'github.com') =>
    Bun.spawnSync([askpass, prompt], { env: { ...env, SW_GIT_HOST: host } }).stdout.toString();
  assert.equal(ask("Password for 'https://u@github.com': "), 'tok\n');
  assert.equal(ask("Username for 'https://evil.example': "), '\n');
  assert.equal(ask("Password for 'https://u@evil.example/x@github.com': "), '\n');
  assert.equal(ask("Password for 'https://u/x@github.com': "), '\n');
  assert.equal(ask("Username for 'https://': ", ''), '\n');
  // With redirects followed, the askpass program alone keeps the token from the other host.
  const credential = { kind: 'token', username: 'u', token: REDIRECT_TOKEN, host: 'unused' };
  const setup = m.credentialSetup(credential);
  const args = [...setup.args, '-c', 'http.followRedirects=true'];
  const leaked = await redirectedPasswords(args, { ...setup.env, GIT_ASKPASS: askpass });
  assert(!leaked.includes(REDIRECT_TOKEN), 'the askpass program answered another host');
}

// A guarded pull through the Source control service: the fetch that the guard checks must carry
// the person's credential, or a remote that requires one refuses it.
if (category === 'remote-guarded-fetch') {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { repoDir } = await import('../src/server/projects/paths');
  const { startCredentialGitServer } = await import('../tests/auth/credential-git-server');
  const team = await teamRepositoryWorkspace();
  const token = 'SECRET-GUARDED-FETCH';
  const served = path.join(team.root, 'served');
  const server = startCredentialGitServer(served, async (_user, password) =>
    password === token ? 'person' : null,
  );
  try {
    const scm = m.createScm({
      layout: team.ws.layout,
      git: team.ws.git,
      gitAvailable: true,
      siblings: () => [team.sales, team.finance],
      project: () => ({}),
      drafts: () => [],
      rescan: async () => {},
      emit: () => {},
    });
    const repo = repoDir(team.ws.layout, team.sales);
    const git = (cwd: string, args: string[]) => {
      const result = Bun.spawnSync(['git', ...args], { cwd });
      assert.equal(result.exitCode, 0, result.stderr.toString());
      return result.stdout.toString().trim();
    };
    const url = server.repository('team.git');
    const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    git(repo, ['push', '-q', server.folder('team.git'), `HEAD:${branch}`]);
    git(repo, ['remote', 'add', 'origin', url]);
    // One commit that only the remote has, so the pull must fetch it.
    const clone = path.join(team.root, 'clone');
    git(team.root, ['clone', '-q', '-b', branch, server.folder('team.git'), clone]);
    fs.writeFileSync(path.join(clone, 'incoming.md'), 'Incoming.\n');
    git(clone, ['add', '.']);
    git(clone, ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'In']);
    git(clone, ['push', '-q', 'origin', branch]);
    const credential = { kind: 'token', username: 'person', token, host: server.host };
    const reader = { ...LOCAL_READER, guard: () => {} };
    const pulled = await scm.pull(team.sales, reader, async () => credential);
    assert(pulled.ok, pulled.stderr);
    const fetches = server.requests.filter(request => request.service === 'git-upload-pack');
    assert(fetches.length > 0 && fetches.every(request => request.identity === 'person'));
  } finally {
    await server.stop();
    team.dispose();
  }
}

if (category === 'remote-consent') {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { createSessionStore } = await import('../src/server/auth/sessions');
  const { localPrincipal } = await import('../src/server/auth/principal');
  const { oidcConfig } = await import('../tests/helpers/server-auth');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-mutations-consent-'));
  try {
    const sessions = createSessionStore({ dir, key: new Uint8Array(32).fill(3) });
    const session = await sessions.create({
      principal: localPrincipal(),
      tokens: { accessToken: 'access', expiresAt: Date.now() + 3_600_000 },
    });
    let now = Date.now();
    let obo = false;
    const credentials = m.createRemoteCredentials({
      config: oidcConfig('http://127.0.0.1:9/issuer', 'http://127.0.0.1:9/graph', 'entra', {
        SW_GITHUB_HOST: 'github.example',
        SW_GITHUB_CLIENT_ID: 'client',
        SW_GITHUB_CLIENT_SECRET: 'secret',
      }),
      client: { onBehalfOf: async () => ({ token: 'ado', expiresAt: now + 3_600_000 }) },
      session: async () => (await sessions.get(session.id))!,
      sessions,
      settings: () => ({
        session: { idleHours: 8, absoluteHours: 24 },
        remote: { allowedHosts: ['dev.azure.com'], azureDevOpsObo: obo },
      }),
      log: () => {},
      now: () => now,
      fetch: (async () => Response.json({ access_token: 'gh' })) as unknown as typeof fetch,
    });
    const connect = async (state: (real: string) => string, later = 0) => {
      const location = await credentials.startGitHub((await sessions.get(session.id))!, '/');
      const real = new URL(location).searchParams.get('state')!;
      now += later;
      const params = new URLSearchParams({ code: 'c', state: state(real) });
      return (await credentials.finishGitHub((await sessions.get(session.id))!, params)).connected;
    };
    assert.equal(await connect(() => 'forged'), false);
    assert.equal(await connect(real => real, 11 * 60_000), false);
    // A token obtained while on-behalf-of was on is refused once it is turned off.
    obo = true;
    const request = new Request('http://127.0.0.1:4310/');
    await credentials.credentialFor(request, 'dev.azure.com');
    obo = false;
    await assert.rejects(credentials.credentialFor(request, 'dev.azure.com'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Per-person working copies: shared helpers for the cases below.
async function copyFixture() {
  const { authWorkspace } = await import('../tests/helpers/auth-workspace');
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const { attachRemoteCredentials, requestAccess } =
    await import('../src/server/auth/request-scope');
  const { allowEveryRemote } = await import('../tests/helpers/remote-credentials-fixture');
  const fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  // A request carrying the person's resolved scope, as the access middleware leaves it.
  const scoped = (
    name: 'alice' | 'bob' | 'frank',
    path: string,
    method = 'GET',
    body?: unknown,
  ) => {
    const request = new Request('http://localhost' + path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    Object.assign(request, {
      [requestAccess]: access.forRequest(access.principalFor(person(name))),
    });
    attachRemoteCredentials(request, allowEveryRemote());
    return request;
  };
  const keyOf = (name: 'alice' | 'bob' | 'frank') => access.principalFor(person(name)).key;
  return { fixture, access, person, scoped, keyOf };
}

if (category === 'copy-author') {
  const { requestReader } = await import('../src/server/auth/request-scope');
  const { join } = await import('node:path');
  const { fixture, scoped, keyOf } = await copyFixture();
  try {
    const reader = requestReader(scoped('alice', '/'));
    const current = fixture.ws.readFile('sales-contracts', 'orders.odcs.yaml', reader);
    const edited = { baseHash: current.hash, source: current.source + '# alice\n' };
    await fixture.ws.saveFile('sales-contracts', 'orders.odcs.yaml', edited, reader);
    const request = scoped('alice', '/api/projects/sales-contracts/git/commit', 'POST', {
      message: 'Alice commits',
      paths: ['orders.odcs.yaml'],
    });
    const response = await m.gitRoutes(fixture.ws, request, new URL(request.url));
    assert.equal(response.status, 200);
    const copy = join(fixture.ws.layout.worktrees, keyOf('alice'), 'sales-contracts');
    const log = Bun.spawnSync(['git', 'log', '-1', '--format=%an'], { cwd: copy });
    assert.equal(log.stdout.toString().trim(), 'Alice Andrade');
  } finally {
    fixture.dispose();
  }
}

if (category === 'copy-worktrees') {
  const { createGit } = await import('../src/server/projects/git');
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fixture } = await copyFixture();
  try {
    const { layout } = fixture.ws;
    const git = createGit({ projectsRoot: layout.projects, worktreesRoot: layout.worktrees });
    const ann = { key: 'u' + 'a'.repeat(20), handle: 'ann', name: 'Ann' };
    const ben = { key: 'u' + 'b'.repeat(20), handle: 'ben', name: 'Ben' };
    const worktrees = m.createWorktrees({ layout, git, people: () => [ann, ben] });
    const commitIn = (dir: string, name: string) => {
      writeFileSync(join(dir, name), name);
      for (const args of [
        ['add', name],
        ['commit', '-q', '-m', name],
      ])
        assert.equal(Bun.spawnSync(['git', ...args], { cwd: dir }).exitCode, 0);
    };
    commitIn((await worktrees.ensure('sales-contracts', ann)).dir, 'ann.txt');
    commitIn((await worktrees.ensure('sales-contracts', ben)).dir, 'ben.txt');
    // A branch another copy holds, or the published one, is refused by name.
    await assert.rejects(worktrees.assertFree('sales-contracts', ben.key, 'work/ann'), /by Ann/);
    await assert.rejects(worktrees.assertFree('sales-contracts', ben.key, 'main'), /published/);
    const unchecked = async () => {};
    await worktrees.publish('sales-contracts', ann.key, unchecked);
    // Ben's copy does not contain Ann's publish, so publishing it would rewrite main.
    await assert.rejects(worktrees.publish('sales-contracts', ben.key, unchecked), /fast-forward/);
  } finally {
    fixture.dispose();
  }
}

if (category === 'copy-publish') {
  const { createGit } = await import('../src/server/projects/git');
  const { rmSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fixture } = await copyFixture();
  try {
    const { layout } = fixture.ws;
    const git = createGit({ projectsRoot: layout.projects, worktreesRoot: layout.worktrees });
    const ann = { key: 'u' + 'a'.repeat(20), handle: 'ann', name: 'Ann' };
    const ben = { key: 'u' + 'b'.repeat(20), handle: 'ben', name: 'Ben' };
    const worktrees = m.createWorktrees({ layout, git, people: () => [ann, ben] });
    const run = (dir: string, args: string[]) => {
      const identity = ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.org'];
      const result = Bun.spawnSync(['git', ...identity, ...args], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr.toString());
      return result.stdout.toString().trim();
    };
    const commitIn = (dir: string, name: string) => {
      writeFileSync(join(dir, name), name);
      run(dir, ['add', name]);
      run(dir, ['commit', '-q', '-m', name]);
      return run(dir, ['rev-parse', 'HEAD']);
    };
    // A remote's default branch that reads as an option is refused.
    const hr = join(layout.projects, 'hr-people');
    run(hr, ['checkout', '-q', '--detach']);
    run(hr, ['update-ref', 'refs/remotes/origin/-evil', 'HEAD']);
    run(hr, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/-evil']);
    await assert.rejects(worktrees.defaultBranch('hr-people'), /Cannot tell/);
    const base = join(layout.projects, 'sales-contracts');
    const tip = () => run(base, ['rev-parse', 'refs/heads/main']);
    const annCommit = commitIn((await worktrees.ensure('sales-contracts', ann)).dir, 'ann.txt');
    const benDir = (await worktrees.ensure('sales-contracts', ben)).dir;
    const before = tip();
    // A guard refusal and a new file in the published checkout each leave main alone.
    const refuse = async () => {
      throw new Error('refused');
    };
    await assert.rejects(worktrees.publish('sales-contracts', ann.key, refuse), /refused/);
    writeFileSync(join(base, 'stray.txt'), 'stray');
    const unchecked = async () => {};
    await assert.rejects(worktrees.publish('sales-contracts', ann.key, unchecked), /changes/);
    rmSync(join(base, 'stray.txt'));
    assert.equal(tip(), before);
    // Ben publishes after Ann's check: Ann's compare-and-swap fails and Ben's tip stays.
    run(benDir, ['merge', '-q', '--ff-only', annCommit]);
    const benTip = commitIn(benDir, 'ben.txt');
    const raced = async () => {
      run(base, ['update-ref', 'refs/heads/main', benTip, before]);
    };
    await assert.rejects(worktrees.publish('sales-contracts', ann.key, raced), /fast-forward/);
    assert.equal(tip(), benTip);
    // The branch moved without the published files: the next start puts them back in step.
    assert.notEqual(run(base, ['rev-parse', 'HEAD']), benTip);
    await worktrees.repairBase('sales-contracts');
    assert.equal(run(base, ['rev-parse', 'HEAD']), benTip);
    // The remote is ahead, but the guards refuse what it brings, so main stays.
    const remoteTip = commitIn(benDir, 'remote.txt');
    run(base, ['update-ref', 'refs/remotes/origin/main', remoteTip]);
    await assert.rejects(worktrees.followRemote('sales-contracts', 'origin', refuse), /refused/);
    assert.equal(tip(), benTip);
  } finally {
    fixture.dispose();
  }
}

if (category === 'copy-drafts') {
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const { dataLayout } = await import('../src/server/projects/paths');
  const data = tempDataDir();
  try {
    const state = m.createState(dataLayout(data.root));
    const draft = { baseHash: null, text: 'alice words', patches: [] };
    state.forOwner('tenant:alice').writeDraft('sales', 'a.yaml', draft);
    assert.equal(state.forOwner('tenant:alice').draft('sales', 'a.yaml').text, 'alice words');
    assert.equal(state.forOwner('tenant:frank').draft('sales', 'a.yaml'), null);
  } finally {
    data.cleanup();
  }
}

if (category === 'copy-save') {
  const { createHandler } = await import('../src/server/handler');
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fixture, access, person } = await copyFixture();
  fixture.ws.close();
  const ws = await m.openWorkspace({ root: fixture.root });
  try {
    const origin = 'http://127.0.0.1:4310';
    const { allowEveryRemote } = await import('../tests/helpers/remote-credentials-fixture');
    const as = (name: 'alice' | 'frank') =>
      createHandler(ws, {
        mode: 'server',
        remoteCredentials: allowEveryRemote(),
        publicOrigin: origin,
        access,
        principal: () => access.principalFor(person(name)),
      });
    const call = (name: 'alice' | 'frank', path: string, method = 'GET', body?: unknown) =>
      as(name)(
        new Request(origin + path, {
          method,
          headers: { Origin: origin, 'X-SW-Request': '1' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const file = '/api/projects/sales-contracts/files/orders.odcs.yaml';
    const draft = '/api/drafts/sales-contracts/orders.odcs.yaml';
    await call('frank', draft, 'PUT', { baseHash: null, text: 'frank words', patches: [] });
    const published = join(ws.layout.projects, 'sales-contracts', 'orders.odcs.yaml');
    const before = readFileSync(published, 'utf8');
    const current = await (await call('alice', file)).json();
    const saved = await call('alice', file, 'PUT', {
      baseHash: current.hash,
      source: current.source + '# alice\n',
    });
    assert.equal(saved.status, 200);
    // Alice's save lands in her copy and outdates only her drafts.
    assert.equal(readFileSync(published, 'utf8'), before);
    assert.equal((await call('frank', draft)).status, 200);
  } finally {
    ws.close();
    fixture.dispose();
  }
}

if (category === 'copy-protected') {
  const { fixture, scoped } = await copyFixture();
  try {
    const target = (name: 'alice' | 'bob') => ({
      ws: fixture.ws,
      request: scoped(name, '/api/projects/sales-contracts/git/publish', 'POST'),
      slug: 'sales-contracts',
    });
    // An Editor neither publishes nor checks out the protected main; the Steward publishes.
    await assert.rejects(m.authorizePublish(target('alice'), undefined), /not authorized/);
    assert.throws(() => m.authorizeCheckout(target('alice'), 'main'), /not authorized/);
    await m.authorizePublish(target('bob'), undefined);
  } finally {
    fixture.dispose();
  }
}

if (category === 'copy-subproject') {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const { bareRepository } = await import('../tests/helpers/git-fixtures');
  const { LOCAL_READER } = await import('../src/server/projects/reader');
  const { createAccessControl } = await import('../src/server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const { saveText, signedIn } = await import('../tests/auth/working-copy-fixture');
  const remote = bareRepository('monorepo');
  const data = tempDataDir();
  const ws = await m.openWorkspace({ root: data.root });
  try {
    const started = ws.clone(remote.bare, undefined, LOCAL_READER);
    const cloned = () =>
      ws.events.replay(0)!.some(event => {
        const clone = event.data as { op?: string; phase?: string };
        return event.event === 'clone' && clone.op === started.op && clone.phase === 'done';
      });
    for (let attempt = 0; attempt < 400 && !cloned(); attempt++) await Bun.sleep(10);
    const projects = ws.state.registry().projects;
    const sales = projects.find(project => project.name === 'Sales')!;
    const finance = projects.find(project => project.name === 'Finance')!;
    const options = accessFixture();
    const assigned = { stewards: [], restricted: [], protectedBranches: [] };
    options.config.projects.projects[sales.slug] = { domain: 'sales', ...assigned };
    options.config.projects.projects[finance.slug] = { domain: 'hr', ...assigned };
    const access = createAccessControl({
      ...options,
      knownProjects: () => projects.map(project => project.slug),
    });
    const as = signedIn(ws, access);
    const alice = as(person('alice'));
    const dave = as(person('dave'));
    const edit = (text: string) => text + '# alice\n';
    const saved = await saveText(alice.call, sales.slug, 'sales.ontology.yaml', edit);
    assert.equal(saved.status, 200);
    const body = { mode: 'delete', confirm: true };
    const deleted = await dave.call(`/api/projects/${sales.slug}`, 'DELETE', body);
    assert.equal(deleted.status, 200);
    // The deleted subproject's folder leaves Alice's copy; the rest of it stays.
    const copy = join(ws.layout.worktrees, alice.principal.key, sales.repo!);
    assert.equal(existsSync(join(copy, 'domains/sales')), false);
    assert.equal(existsSync(join(copy, 'domains/finance')), true);
  } finally {
    ws.close();
    data.cleanup();
    remote.dispose();
  }
}

if (category === 'copy-suggestions') {
  const { requestReader } = await import('../src/server/auth/request-scope');
  const { fixture, scoped } = await copyFixture();
  fixture.ws.close();
  const ws = await m.openWorkspace({ root: fixture.root });
  try {
    const alice = requestReader(scoped('alice', '/'));
    const frank = requestReader(scoped('frank', '/'));
    const model = ws.readFile('sales-metrics', 'sales.semantic.yaml').source;
    // Proposed, not approved: an Editor may create a model but not approve its metrics.
    const extra = model
      .replace('name: Sales semantic model', 'name: Extra semantic model')
      .replace('"status": "approved"', '"status": "proposed"');
    const file = { baseHash: null, source: extra };
    await ws.saveFile('sales-metrics', 'extra.semantic.yaml', file, alice);
    // Alice's unpublished model suggests groupings to her alone.
    assert.equal(ws.suggestionCount(alice, []), 3);
    assert.equal(ws.suggestionCount(frank, []), 0);
  } finally {
    ws.close();
    fixture.dispose();
  }
}

// Entra sign-in through MSAL: the library choice, the session's token cache at rest, PKCE, the
// certificate credential and group overage.
if (category === 'msal-choice') {
  assert.equal(m.signInLibrary('entra'), 'msal');
  assert.equal(m.signInLibrary('generic'), 'openid-client');
  assert.equal(m.signInLibrary('keycloak'), 'openid-client');
}
if (category === 'msal-cache') {
  // MSAL's cache holds refresh tokens; it may live only in the encrypted session record.
  const helpers = await import('../tests/helpers/entra-provider');
  const writes: unknown[] = [];
  const write = Bun.write;
  Bun.write = ((...args: unknown[]) => {
    writes.push(args[0]);
    return Promise.resolve(0);
  }) as typeof Bun.write;
  try {
    await helpers.withEntraProvider(async provider => {
      const client = await m.createMsalProvider(helpers.entraConfig(provider));
      const identity = await helpers.signInWith(client, provider, 'alice');
      assert(identity.tokens.tokenCache);
    });
  } finally {
    Bun.write = write;
  }
  assert.deepEqual(writes, [], 'The MSAL token cache was written to a file');
}
if (category === 'msal-state') {
  const helpers = await import('../tests/helpers/entra-provider');
  await helpers.withEntraProvider(async provider => {
    const client = await m.createMsalProvider(helpers.entraConfig(provider));
    // Without the expected state MSAL parses the returned one as its own format and fails.
    assert((await helpers.signInWith(client, provider, 'alice')).principal.id);
    const started = await client.login('/');
    const callback = new URL(await provider.authorizeAs('alice', started.url));
    callback.searchParams.set('state', 'forged');
    await assert.rejects(client.callback(callback, started.attempt));
  });
}
if (category === 'msal-refresh') {
  const helpers = await import('../tests/helpers/entra-provider');
  await helpers.withEntraProvider(async provider => {
    const client = await m.createMsalProvider(helpers.entraConfig(provider));
    const identity = await helpers.signInWith(client, provider, 'alice');
    assert((await client.refresh(identity.tokens)).principal.id);
  });
  await helpers.withEntraProvider(
    async provider => {
      const client = await m.createMsalProvider(helpers.entraConfig(provider));
      const identity = await helpers.signInWith(client, provider, 'alice');
      await assert.rejects(client.refresh(identity.tokens));
    },
    { refreshIdToken: 'repeat' },
  );
}
if (category === 'msal-authority') {
  const tenant = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';
  const env = {
    SW_MODE: 'server',
    SW_PUBLIC_URL: 'https://workbench.example',
    SW_OIDC_ISSUER: `https://login.microsoftonline.com/${tenant}/v2.0`,
    SW_OIDC_CLIENT_ID: 'client',
    SW_OIDC_CLIENT_SECRET: 'secret',
    SW_OIDC_PROVIDER: 'entra',
    SW_ENTRA_TENANT_ID: tenant,
    SW_SESSION_KEY: Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString(
      'base64',
    ),
    SW_BOOTSTRAP_ADMINS: 'admin@example.org',
  };
  assert.equal(m.readConfig(env).mode, 'server');
  const loopback = `https://127.0.0.1:4400/${tenant}/v2.0`;
  assert.throws(() => m.readConfig({ ...env, SW_OIDC_ISSUER: loopback }));
}
if (category === 'msal-host') {
  const tenant = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';
  const microsoft = m.entraAuthority(`https://login.microsoftonline.com/${tenant}/v2.0`, tenant);
  assert.equal(microsoft.host, 'login.microsoftonline.com');
  // MSAL would send the credential and refresh tokens to whatever host it is given.
  assert.throws(() => m.entraAuthority(`https://login.example.org/${tenant}/v2.0`, tenant));
}
if (category === 'front-channel-issuer') {
  const helpers = await import('../tests/helpers/entra-provider');
  const { authWorkspace } = await import('../tests/helpers/auth-workspace');
  const { createHandler } = await import('../src/server/handler');
  await helpers.withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const config = helpers.entraConfig(provider);
    const auth = await m.createServerAuthentication(fixture.ws, config);
    try {
      const handler = createHandler(fixture.ws, auth);
      const origin = 'http://127.0.0.1:4310';
      const start = await handler(new Request(origin + '/auth/login'));
      const attempt = start.headers.getSetCookie()[0].split(';')[0];
      const callback = await provider.authorizeAs('alice', start.headers.get('location')!);
      const signedIn = await handler(new Request(callback, { headers: { Cookie: attempt } }));
      const cookie = signedIn.headers
        .getSetCookie()
        .find((value: string) => value.startsWith('sw-session='))!
        .split(';')[0];
      const id = cookie.slice('sw-session='.length);
      const sid = (await auth.authentication.sessions.get(id, false)).tokens.providerSession.sid;
      const query = new URLSearchParams({ iss: 'https://attacker.example/v2.0', sid });
      await handler(new Request(`${origin}/auth/front-channel-logout?${query}`));
      const me = await handler(new Request(origin + '/api/me', { headers: { Cookie: cookie } }));
      assert.equal(me.status, 200, 'Another issuer ended the session');
    } finally {
      auth.close();
    }
  });
}
if (category === 'msal-pkce') {
  const helpers = await import('../tests/helpers/entra-provider');
  await helpers.withEntraProvider(async provider => {
    const client = await m.createMsalProvider(helpers.entraConfig(provider));
    const identity = await helpers.signInWith(client, provider, 'alice');
    assert(identity.principal.id);
  });
}
if (category === 'msal-certificate') {
  const privateKey = '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----';
  const assertion = async () => 'unused';
  for (const thumbprint of ['a'.repeat(64), 'b'.repeat(40)]) {
    const credential = m.msalCredential({ kind: 'certificate', privateKey, thumbprint }, assertion);
    assert.equal(credential.clientSecret, undefined);
    assert.equal(credential.clientCertificate?.privateKey, privateKey);
  }
}
if (category === 'msal-overage') {
  const helpers = await import('../tests/helpers/entra-provider');
  const { authWorkspace } = await import('../tests/helpers/auth-workspace');
  const { createHandler } = await import('../src/server/handler');
  await helpers.withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const auth = await m.createServerAuthentication(fixture.ws, helpers.entraConfig(provider));
    try {
      const handler = createHandler(fixture.ws, auth);
      const origin = 'http://127.0.0.1:4310';
      const start = await handler(new Request(origin + '/auth/login'));
      const attempt = start.headers.getSetCookie()[0].split(';')[0];
      const callback = await provider.authorizeAs('olga', start.headers.get('location')!);
      const signedIn = await handler(new Request(callback, { headers: { Cookie: attempt } }));
      // Olga's groups exceed the token, so only the directory lookup grants her access.
      assert.equal(signedIn.headers.get('location'), '/');
      assert(provider.calls.some(call => call.endpoint === 'graph-check'));
    } finally {
      auth.close();
    }
  });
}

// Delivery hardening cases. Each one passes on the real module and fails on every mutant.
if (category === 'deploy-ingress') {
  const { fakeApp, fakeTarget } = await import('./deploy-fake');
  assert.doesNotThrow(() => m.preflight(fakeApp(), fakeTarget));
  const exposures: ((app: any) => void)[] = [
    app => (app.ingress.external = false),
    app => (app.ingress.allowInsecure = true),
    app => (app.ingress.transport = 'tcp'),
    app => (app.ingress.corsOrigins = ['*']),
    app => (app.env.SW_PUBLIC_URL = 'https://other.example'),
  ];
  for (const expose of exposures) {
    const app = fakeApp();
    expose(app);
    assert.throws(() => m.preflight(app, fakeTarget), /Preflight failed: ingress|SW_PUBLIC_URL/);
  }
}
if (category === 'deploy-ingress-read') {
  const { fakeApp, fakeTarget } = await import('./deploy-fake');
  const response = (ingress: object | undefined) => ({
    identity: { userAssignedIdentities: { [fakeApp().identity]: {} } },
    properties: {
      configuration: { activeRevisionsMode: 'Single', ingress },
      template: { containers: [{ env: [] }], scale: {} },
    },
  });
  const read = (ingress: object | undefined) =>
    m.appSettings(response(ingress), fakeTarget).ingress;
  assert.equal(read(undefined).external, false);
  assert.equal(read({}).allowInsecure, true);
  assert.equal(read({ allowInsecure: false, external: true }).allowInsecure, false);
  assert.equal(read({ allowInsecure: false, external: true }).external, true);
  assert.deepEqual(read({ corsPolicy: {} }).corsOrigins, ['*']);
  assert.deepEqual(read({ corsPolicy: { allowedOrigins: ['https://a.example'] } }).corsOrigins, [
    'https://a.example',
  ]);
}
if (category === 'deploy-lock') {
  const { fakeAzure, fakeTarget, fakeRelease } = await import('./deploy-fake');
  const client = fakeAzure();
  await m.deploy(fakeTarget, fakeRelease, client);
  assert.deepEqual(
    client.calls.slice(-2).map((call: unknown[]) => call[0]),
    ['promote', 'lock'],
  );
}
if (category === 'image-lock') {
  const { fakeTarget, fakeRelease } = await import('./deploy-fake');
  assert.deepEqual(m.releaseTags(fakeRelease), [`sha-${fakeRelease.commit}`, fakeRelease.tag]);
  assert.deepEqual(m.lockArguments(fakeTarget, 'v0.4.0').slice(-2), ['--write-enabled', 'false']);
}
if (category === 'deploy-lock-client') {
  const { fakeTarget, fakeRelease } = await import('./deploy-fake');
  const calls: string[][] = [];
  const client = m.azureClient(fakeTarget, async (args: string[]) => {
    calls.push(args);
    return '';
  });
  await client.lock(fakeRelease);
  assert.equal(calls.length, 2);
}
if (category === 'image-push-guard') {
  const { fakeTarget } = await import('./deploy-fake');
  Object.assign(process.env, fakeTarget);
  const commit = 'a'.repeat(40);
  const context = { engine: 'docker', commit, version: '0.4.0', created: 'now', source: 'x' };
  const digest = `sha256:${'e'.repeat(64)}`;
  const labels = {
    'org.opencontainers.image.revision': commit,
    'org.opencontainers.image.version': '0.4.0',
  };
  const tagJson = (value: string, writeEnabled: boolean) =>
    JSON.stringify({ digest: value, writeEnabled });
  const notFound = () => {
    throw Error('MANIFEST_UNKNOWN: not found');
  };
  const record = (
    reads: (() => string)[],
    imageLabels: object | undefined = labels,
    out?: string,
  ) => {
    const calls: string[][] = [];
    let index = 0;
    const run = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'az' && args.includes('show')) return reads[index++]();
      if (args.includes('inspect')) return JSON.stringify({ config: { Labels: imageLabels } });
      if (args.includes('push')) return out ?? `latest: digest: ${digest} size: 1`;
      return '';
    };
    return { calls, run };
  };
  const push = (run: (args: string[]) => Promise<string>) =>
    m.pushCommitImage(context, 'swfake.azurecr.io', fakeTarget, run);
  const pushed = (calls: string[][]) => calls.some(args => args.includes('push'));
  const kept = record([() => tagJson(digest, false)]);
  assert.deepEqual(await push(kept.run), { digest, kept: true });
  assert(!pushed(kept.calls));
  const unlocked = record([() => tagJson(digest, true)]);
  await assert.rejects(() => push(unlocked.run), /not locked/);
  assert(!pushed(unlocked.calls));
  for (const wrong of [
    { ...labels, 'org.opencontainers.image.revision': 'b'.repeat(40) },
    { ...labels, 'org.opencontainers.image.version': '0.3.0' },
  ]) {
    await assert.rejects(
      () => push(record([() => tagJson(digest, false)], wrong).run),
      /Existing image is labelled/,
    );
  }
  const denied = record([
    () => {
      throw Error('AuthorizationFailed');
    },
  ]);
  await assert.rejects(() => push(denied.run), /AuthorizationFailed/);
  assert(!pushed(denied.calls));
  const fresh = record([notFound, () => tagJson(digest, false)]);
  assert.deepEqual(await push(fresh.run), { digest, kept: false });
  assert.equal(fresh.calls.filter(args => args.includes('push')).length, 1);
  assert(fresh.calls.some(args => args.includes('update') && args.includes('false')));
  await assert.rejects(
    () => push(record([notFound, () => tagJson(`sha256:${'f'.repeat(64)}`, false)]).run),
    /does not point to the pushed digest/,
  );
  await assert.rejects(
    () => push(record([notFound], labels, 'done').run),
    /did not report an image digest/,
  );
}
if (category === 'deploy-promote-rerun') {
  const { fakeTarget, fakeRelease } = await import('./deploy-fake');
  const state = (value: string) => JSON.stringify({ digest: value, writeEnabled: true });
  const run = (answer: string) => {
    const calls: string[][] = [];
    const client = m.azureClient(fakeTarget, async (args: string[]) => {
      calls.push(args);
      return answer;
    });
    return { calls, client };
  };
  const same = run(state(fakeRelease.digest));
  await same.client.promote(fakeRelease);
  assert(!same.calls.some(args => args.includes('create')));
  const different = run(state(`sha256:${'9'.repeat(64)}`));
  await assert.rejects(() => different.client.promote(fakeRelease), /another digest/);
}
if (category === 'deploy-ancestry' || category === 'deploy-ancestry-cli') {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const repository = mkdtempSync('/tmp/sw-mutation-ancestry-');
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(['git', '-C', repository, ...args], {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Tester',
        GIT_AUTHOR_EMAIL: 'tester@example.invalid',
        GIT_COMMITTER_NAME: 'Tester',
        GIT_COMMITTER_EMAIL: 'tester@example.invalid',
      },
    });
    assert.equal(result.exitCode, 0);
    return result.stdout.toString().trim();
  };
  const commitFile = (name: string) => {
    writeFileSync(`${repository}/${name}`, name);
    git('add', name);
    git('commit', '-q', '-m', name);
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-q', '-b', 'main');
    const reviewed = commitFile('reviewed');
    git('update-ref', 'refs/remotes/origin/main', reviewed);
    git('checkout', '-q', '-b', 'unreviewed');
    const unreviewed = commitFile('unreviewed');
    if (category === 'deploy-ancestry') {
      await m.assertCommitOnMain(reviewed, repository);
      await assert.rejects(
        () => m.assertCommitOnMain(unreviewed, repository),
        /not on origin\/main/,
      );
      await assert.rejects(() => m.assertCommitOnMain(reviewed, '/tmp'), /Could not compare/);
      assert.throws(() => m.mainAncestryArguments('HEAD'), /40-hex/);
      assert.equal(m.mainAncestryArguments(reviewed).at(-1), 'origin/main');
    } else {
      const { fakeTarget } = await import('./deploy-fake');
      writeFileSync(`${repository}/package.json`, JSON.stringify({ version: '0.4.0' }));
      const result = Bun.spawnSync([process.execPath, process.argv[2]], {
        cwd: repository,
        env: {
          ...process.env,
          ...fakeTarget,
          SOURCE_REF: 'refs/tags/v0.4.0',
          SOURCE_VERSION: unreviewed,
        },
      });
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr.toString(), /not on origin\/main/);
    }
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}
if (category === 'pipeline-gates') {
  const imageJobs = 'deploy/azure-devops/templates/image-jobs.yml';
  m.lintRules(m.readPipelineInput());
  const publish = '      - task: PublishPipelineArtifact@1';
  const extraStep = (condition: string) => `      - task: AzureCLI@2
        condition: ${condition}
        inputs:
          azureSubscription: \${{ parameters.acrServiceConnection }}
          scriptType: bash
          scriptLocation: inlineScript
          inlineScript: bun run check
${publish}`;
  const tagGate = "and(succeeded(), startsWith(variables['Build.SourceBranch'], 'refs/tags/v'))";
  const variants: [string, string, string, RegExp][] = [
    [imageJobs, publish, extraStep('always()'), /main or tags only/],
    [imageJobs, publish, extraStep(tagGate), /exactly one AzureCLI/],
    [
      imageJobs,
      'azureSubscription: ${{ parameters.acrPullServiceConnection }}',
      'azureSubscription: ${{ parameters.acrServiceConnection }}',
      /pull connection/,
    ],
    [
      imageJobs,
      'azureSubscription: ${{ parameters.acrServiceConnection }}',
      'azureSubscription: ${{ parameters.acrPullServiceConnection }}',
      /main\/tag-only push/,
    ],
    [imageJobs, 'fetchDepth: 0', 'fetchDepth: 1', /full history/],
    [
      imageJobs,
      "condition: >-\n          and(succeeded(), or(eq(variables['Build.SourceBranch'], 'refs/heads/main'),\n          startsWith(variables['Build.SourceBranch'], 'refs/tags/v')))",
      'condition: succeeded()',
      /main or tags only/,
    ],
    [
      'azure-pipelines.yml',
      'production: true',
      'production: false',
      /production dependencies only/,
    ],
    [
      'azure-pipelines-rollback.yml',
      '                    ROLLBACK_TARGET: ${{ parameters.target }}\n',
      '                    ROLLBACK_TARGET: ${{ parameters.target }}\n      - job: extra\n        steps:\n          - task: AzureCLI@2\n            inputs:\n              azureSubscription: ${{ parameters.deployServiceConnection }}\n              scriptType: bash\n              scriptLocation: inlineScript\n              inlineScript: bun run check\n',
      /service connection outside a deployment/,
    ],
  ];
  for (const [file, before, after, message] of variants) {
    const input = m.readPipelineInput();
    assert(input.files[file].includes(before), `Missing anchor in ${file}: ${before}`);
    input.files[file] = input.files[file].replace(before, after);
    assert.throws(() => m.lintRules(input), message);
  }
  const extra = m.readPipelineInput();
  extra.files['deploy/azure-devops/templates/extra.yml'] =
    'steps:\n  - task: AzureCLI@2\n    inputs:\n      azureSubscription: ${{ parameters.acrServiceConnection }}\n      scriptType: bash\n      scriptLocation: inlineScript\n      inlineScript: bun run check\n';
  assert.throws(() => m.lintRules(extra), /service connection outside a deployment or Image job/);
}
if (category === 'pipeline-pr-azure') {
  const { lintRules, readPipelineInput, readSampleVariables } = await import('./pipeline-lint');
  const documents = lintRules(readPipelineInput());
  assert.doesNotThrow(() => m.buildPlan(documents, readSampleVariables(), 'pr'));
  documents['deploy/azure-devops/templates/image-jobs.yml'].jobs[0].condition = 'succeeded()';
  assert.throws(
    () => m.buildPlan(documents, readSampleVariables(), 'pr'),
    /Pull-request runs must not use a service connection/,
  );
}
if (category === 'container-hardening') {
  assert.deepEqual(m.hardenedRunArguments(), [
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
  ]);
}
if (category === 'save-failure-wording') {
  assert.equal(m.failureReason('Refused: a classification change.'), 'a classification change.');
  assert.equal(m.failureReason('file changed on disk'), 'file changed on disk');
  assert.equal(m.failureReason(null), 'the save failed');
  const failed = { status: 'failed', message: 'Refused: no.' };
  assert.equal(m.saveStateLabel(failed, 0), 'Not saved: no.');
}
if (category === 'sparse-folder-path') {
  const accepted: [string, string][] = [
    ['semantic/ubl', 'semantic/ubl'],
    [' semantic/ubl/ ', 'semantic/ubl'],
    ['', ''],
    ['a b/c-d.e', 'a b/c-d.e'],
  ];
  for (const [typed, folder] of accepted)
    assert.deepEqual(m.checkRepositoryFolder(typed), { ok: true, folder });
  assert.deepEqual(m.checkRepositoryFolder(undefined), { ok: true, folder: '' });
  const refused = [
    '../x',
    'a/../b',
    'a/./b',
    '/etc',
    'C:/x',
    'a//b',
    'a\\b',
    '.git',
    'a/.GIT',
    '-x',
    'a/*',
    'a/[b]',
    'a\nb',
    'a\u0001b',
    'x'.repeat(501),
  ];
  for (const typed of refused)
    assert.equal(m.checkRepositoryFolder(typed).ok, false, JSON.stringify(typed));
  assert.equal(m.checkRepositoryFolder(42).ok, false);
  // The message names the actual problem, not only that the path is refused.
  assert.match(m.checkRepositoryFolder('/etc').message, /absolute/);
  assert.match(m.checkRepositoryFolder('a\\b').message, /forward slashes/);
  assert.match(m.checkRepositoryFolder('a/'.repeat(300) + 'b').message, /too long/);
}
if (category === 'sparse-checkout-arguments') {
  assert.deepEqual(m.sparseSetArguments(['a/b']), [
    'sparse-checkout',
    'set',
    '--cone',
    '--',
    'a/b',
  ]);
  assert.deepEqual(m.conePathspecs(['semantic/ubl']), [
    ':(glob)*',
    'semantic/ubl',
    ':(glob)semantic/*',
  ]);
  assert.deepEqual(m.conePathspecs(['a/b/c']), [':(glob)*', 'a/b/c', ':(glob)a/*', ':(glob)a/b/*']);
  assert.deepEqual(m.conePathspecs(['ubl']), [':(glob)*', 'ubl']);
}
if (category === 'sparse-partial-clone') {
  const { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'workbench-partial-'));
  const record = join(root, 'arguments.txt');
  const fake = join(root, 'fake-git');
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${record}'\n`);
  chmodSync(fake, 0o755);
  const parent = join(root, 'projects', 'staging');
  // The fake Git clones nothing, so the folder the configuration commands run in is made here.
  mkdirSync(join(parent, 'repo'), { recursive: true });
  const git = m.createGit({ projectsRoot: join(root, 'projects'), binary: fake });
  await git.clone(parent, 'file:///team.git', 'repo', undefined, { partial: true });
  await git.clone(parent, 'file:///team.git', 'repo', undefined);
  const clones = readFileSync(record, 'utf8')
    .split('\n')
    .filter(line => line.includes(' clone '));
  assert.equal(clones.length, 2);
  assert(clones[0].includes('--filter=blob:none') && clones[0].includes('--no-checkout'));
  assert(!clones[1].includes('--filter') && !clones[1].includes('--no-checkout'));
}
await observabilityCase(category, m);
