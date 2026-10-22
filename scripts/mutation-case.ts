// Runs focused assertions against candidate modules to detect deliberately introduced faults.
import { LOCAL_READER } from '../server/projects/reader';
import assert from 'node:assert/strict';
const m = await import(process.argv[2]);
const category = process.argv[3];
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
        await ws.importBatch({ files: [{ path: 'a.yaml', source }] });
        await ws.saveFile('sample', 'a.yaml', {
          baseHash: hash(source),
          source: source.replace('Customer', 'Buyer'),
        });
        await assert.rejects(
          () =>
            ws.saveFile('sample', 'a.yaml', {
              baseHash: hash(source),
              source: source.replace('Customer', 'Other'),
            }),
          /changed/,
        );
        await assert.rejects(() =>
          ws.saveFile('sample', 'a.yaml', {
            baseHash: hash(source.replace('Customer', 'Buyer')),
            source: 'ontology: []',
          }),
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
      const { openWorkspace } = await import('../server/projects/workspace');
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
      const { openWorkspace } = await import('../server/projects/workspace');
      const { LOCAL_READER } = await import('../server/projects/reader');
      const ws = await openWorkspace({ root: d.root, now: () => clock });
      try {
        await ws.importBatch({ files: [{ path: 'a.yaml', source }] });
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
        const first = await trash.deleteFile('sample', 'a.yaml');
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
      const { openWorkspace } = await import('../server/projects/workspace');
      const ws = await openWorkspace({ root: d.root });
      try {
        await ws.importBatch({ files: [{ path: 'a.yaml', source }] });
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
      const { dataLayout } = await import('../server/projects/paths');
      const { createState } = await import('../server/projects/state');
      const { createJournal } = await import('../server/projects/journal');
      const { createGit } = await import('../server/projects/git');
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
  const { inspect } = await import('../src/model');
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
  const { applyPatches } = await import('../src/editor/patch');
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
  const { applyPatches } = await import('../src/editor/patch');
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
  const { applyPatches } = await import('../src/editor/patch');
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
  // An edge to a column on another page attaches to the "more" row.
  const card = {
    id: 'k',
    kind: 'object',
    label: 'k',
    file: '',
    columns: Array.from({ length: 12 }, (_, i) => ({ id: `k/c${i}`, path: `c${i}`, badges: [] })),
  };
  assert.equal(m.pageColumns(card, 0, new Set()).port('k/c11'), m.moreRowId('k'));
}
if (category === 'mapping-graph') {
  const { buildContext, agentCatalog } = await import(
    new URL('../server/agent/runtime.ts', import.meta.url).href
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
          ? s +
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
      },
      journal: { newId: () => 'op1', run: () => {} },
      projects: () => [],
      lock: async (_key: string, run: () => unknown) => run(),
      registrySteps: () => [],
      scan: async () => {},
      invalidFiles: () => [],
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
  const { openWorkspace } = await import('../server/projects/workspace');
  const d = tempDataDir();
  const ws = await openWorkspace({ root: d.root });
  const text = (name: string) =>
    `name: ${name}\nontology: [{concept: ${name}, type: EntityType}]\n`;
  await ws.importBatch({
    name: 'team',
    files: [
      { path: 'domains/sales/sales.yaml', source: text('Sales') },
      { path: 'domains/finance/finance.yaml', source: text('Finance') },
    ],
  });
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
  const { emptyAccessConfig } = await import('../server/auth/access-config');
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
  const { localPrincipal } = await import('../server/auth/principal');
  const { createAuditLog } = await import('../server/auth/audit');
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
  const { createAuditLog } = await import('../server/auth/audit');
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
  assert.deepEqual(await health.json(), { ok: true, version: null, commit: null });
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
  const { localPrincipal } = await import('../server/auth/principal');
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
    SW_OIDC_ISSUER: 'https://provider.example',
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
  assert.throws(() => m.readConfig({ ...env, SW_OIDC_ISSUER: 'http://provider.example' }));
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
  const { createAccessControl } = await import('../server/auth/authorize');
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
        access,
        principal: () => principal,
      });
      const response = await handler(
        new Request(
          'http://localhost/api/agent/context?mappingId=sales-contracts/people.mapping.yaml',
        ),
      );
      assert.equal(response.status, 200);
      assert(!(await response.text()).includes('LEAK-hr-'));
    }
    if (category === 'read-drafts') {
      const { requestAccess } = await import('../server/auth/middleware');
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
      const { requestAccess } = await import('../server/auth/middleware');
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
