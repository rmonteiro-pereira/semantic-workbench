// Checks workspace interactions in the browser using isolated example projects.
import { LOCAL_READER } from '../src/server/projects/reader';
import { appUrl } from './helpers/base-url';
import { showEveryEntity, viewOptions } from './helpers/graph-options';
import { chromium, expect } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { inspect } from '../src/shared/core/model';
import { readFile } from 'node:fs/promises';
import { editorValue, expectEditorValue, fillEditor } from './helpers/code-editor';
import { example } from './helpers/examples';
import { exportFile } from './helpers/header';
import { closeComposer, openComposer } from './helpers/query-composer';
// Isolated data root: the UBL example project plus commerce.owl imported as its own project.
const api = await startIsolatedApi();
const store = {
  list: () => api.ws.documents(),
  save: (filename: string, source: string) => api.ws.saveDocument(filename, source, LOCAL_READER),
};
const files = [
  'ubl.ontology.yaml',
  'ubl.owl.ttl',
  'ubl.odcs.yaml',
  'ubl.semantic.yaml',
  'ubl.shacl.ttl',
  'commerce.owl',
];
const asset = (filename: string) =>
  'public/examples/' + (filename === 'commerce.owl' ? 'commerce/' : 'ubl/') + filename;
await api.ws.loadExample('ubl');
await api.ws.importBatch(
  {
    files: [{ path: 'commerce.owl', source: await Bun.file(asset('commerce.owl')).text() }],
  },
  LOCAL_READER,
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
});
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
// The neighborhood shows its center plus the neighbors its counts say are shown.
async function expectNeighborhood() {
  const status = page.getByRole('status', { name: 'Neighbor counts' });
  await expect(status).toContainText(/^\d+ of \d+ neighbors/);
  // The counts can still describe the previous document while the new graph renders, so the
  // counts are re-read until they and the drawn nodes agree.
  await expect(async () => {
    const shown = Number((await status.innerText()).match(/^(\d+) of/)![1]);
    if (!shown) throw Error('Empty neighborhood');
    await expect(page.locator('.react-flow__node')).toHaveCount(shown + 1, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}
let failNextSave = false;
let holdPlan = false;
let releasePlan: (() => void) | null = null;
await routeApi(page, api, async route => {
  const r = route.request();
  const path = new URL(r.url()).pathname;
  if (failNextSave && r.method() === 'POST' && path === '/api/import') {
    failNextSave = false;
    await route.fulfill({ status: 503, json: { error: 'Temporary API failure' } });
    return true;
  }
  if (holdPlan && r.method() === 'POST' && path === '/api/agent/plan') {
    holdPlan = false;
    await new Promise<void>(resolve => {
      releasePlan = resolve;
    });
  }
  return false;
});
if (process.env.UI_MUTATION === 'clear-nodes')
  await page.route('**/src/app/graph/NeighborhoodGraph.tsx*', async route => {
    const response = await route.fetch();
    const source = await response.text(); // The node list is the expansion canvas, revealed in chunks.
    const anchor = 'const build = (limit = reveal) => shownEntities.slice(0, limit).map';
    if (!source.includes(anchor)) throw Error('UI mutation anchor missing');
    console.log('INJECTED_CLEAR_NODES_MUTATION');
    await route.fulfill({
      response,
      body: source.replace(anchor, 'const build = (limit = reveal) => [].map'),
    });
  });
try {
  await page.goto(appUrl());
  await check('existing example opens repeatedly without clearing graph', async () => {
    for (let i = 0; i < 3; i++) {
      await (await example(page, /Load UBL business model/)).click();
      await expect(page.locator('footer')).toContainText('45 entities · 277 relationships');
      await expect(page.locator('.react-flow__node').first()).toBeVisible();
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/workbench-ui-focus.png' });
  });
  await check('canvas is calm and graph controls remain visible', async () => {
    await page.mouse.move(250, 100);
    await expectNeighborhood();
    await expect(page.locator('.react-flow__edge-text, .relationship-label')).toHaveCount(0);
    await expect(await example(page, /Load UBL business model/)).toBeInViewport();
    await expect(page.getByRole('button', { name: /^View options/ })).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Show all connected', exact: true }),
    ).toBeInViewport();
  });
  await check('grouped connection exposes all original relationships', async () => {
    const edge = page.locator('.react-flow__edge').first();
    await page.waitForTimeout(350);
    const point = await edge.locator('.react-flow__edge-interaction').evaluate((path: any) => {
      const group = path.closest('.react-flow__edge');
      const t = path.getScreenCTM();
      for (let i = 1; i < 100; i++) {
        const p = path.getPointAtLength((path.getTotalLength() * i) / 100);
        const x = t.a * p.x + t.c * p.y + t.e;
        const y = t.b * p.x + t.d * p.y + t.f;
        if (document.elementFromPoint(x, y)?.closest('.react-flow__edge') === group)
          return { x, y };
      }
      return null;
    });
    if (!point) throw Error('No unobstructed point on relationship hit area');
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('.inspector h2')).toBeVisible();
    const combo = page.getByLabel('Connection relationship');
    if (await combo.count()) {
      const options = await combo.locator('option').allTextContents();
      if (options.length < 2) throw Error('Grouping lost relationships');
      await combo.selectOption({ index: 1 });
      await expect(page.locator('.inspector h2')).toHaveText(options[1]);
    }
  });
  await check('every UBL export downloads original bytes and round-trips', async () => {
    for (const filename of files) {
      await page.getByRole('button', { name: filename, exact: true }).click();
      await expect(page.locator('.react-flow__node').first()).toBeVisible();
      const [download] = await Promise.all([page.waitForEvent('download'), exportFile(page)]);
      if (download.suggestedFilename() !== filename) throw Error('Wrong filename');
      const path = await download.path();
      if (!path) throw Error('No downloaded file');
      const bytes = await readFile(path);
      const original = await Bun.file(asset(filename)).text();
      if (bytes.toString() !== original) throw Error('Export changed source');
      inspect(bytes.toString(), filename);
    }
  });
  await check(
    'source edit exports unsaved text and reimport persists to the project folder',
    async () => {
      await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
      await page.getByRole('button', { name: 'Source', exact: true }).click();
      const source = await editorValue(page.getByLabel('Definition source'));
      const edited = source + '\n# unsaved export regression\n';
      await fillEditor(page.getByLabel('Definition source'), edited);
      const [download] = await Promise.all([page.waitForEvent('download'), exportFile(page)]);
      const path = await download.path();
      if (!path || (await readFile(path, 'utf8')) !== edited)
        throw Error('Unsaved source was not exported');
      page.once('dialog', d => d.accept());
      await page.locator('input[type=file]').setInputFiles({
        name: 'roundtrip.ontology.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from(edited),
      });
      await expect(
        page.getByRole('button', { name: 'roundtrip.ontology.yaml', exact: true }),
      ).toBeVisible();
      const saved = store.list().find((d: any) => d.filename === 'roundtrip.ontology.yaml') as any;
      if (saved?.source !== edited) throw Error('Reimport did not persist exact bytes');
      await expect(page.locator('.react-flow__node').first()).toBeVisible();
    },
  );
  await check(
    'switching documents and loading example after import rebuilds the graph',
    async () => {
      await (await example(page, /Load UBL business model/)).click();
      await expectNeighborhood();
      await page.getByPlaceholder('Find an entity…').fill('Invoice');
      await expect(page.locator('.react-flow__node').first()).toBeVisible();
      await viewOptions(page, async options => {
        const recenter = options.getByRole('button', { name: 'Re-center', exact: true });
        await recenter.click();
        await expect(recenter).toBeEnabled();
      });
    },
  );
  await check(
    'full model shows all entities and every matrix count opens real relationships',
    async () => {
      await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
      await expect(page.locator('.area-entities button')).toHaveCount(45);
      await expect(page.locator('.business-area')).toHaveCount(8);
      await expect(page.locator('.inspector')).toHaveCount(0);
      await expect(page.locator('.model-overview .react-flow__edge')).toHaveCount(0);
      await page.locator('[data-entity-id="ontology/0"]').click();
      await expect(page.locator('.inspector h2')).toHaveText('Order');
      await expect(page.locator('.area-entities .connected')).not.toHaveCount(0);
      await page.getByRole('button', { name: 'Close details', exact: true }).click();
      await expect(page.locator('.inspector')).toHaveCount(0);
      await expect(page.locator('.area-entities button')).toHaveCount(45);
      await page.getByRole('button', { name: 'Relationship matrix', exact: true }).click();
      const counts = await page.locator('.matrix-view td button').allTextContents();
      if (counts.reduce((n, v) => n + Number(v), 0) !== 277)
        throw Error('Matrix does not account for every relationship');
      await page.getByRole('button', { name: /Business documents to Trading parties:/ }).click();
      const row = page.locator('.connection-list>button').first();
      const name = await row.locator('strong').innerText();
      await row.click();
      await expect(page.locator('.inspector h2')).toHaveText(name);
      await page.screenshot({ path: '/tmp/workbench-ui-matrix.png' });
      await page.getByRole('button', { name: 'Close relationship list', exact: true }).click();
      await page.getByRole('button', { name: 'Business areas', exact: true }).click();
      await page.getByPlaceholder('Find an entity…').fill('Shipment');
      await expect(page.locator('.area-entities button')).toHaveCount(1);
      await page.getByPlaceholder('Find an entity…').fill('');
      await expect(page.locator('.area-entities button')).toHaveCount(45);
      await page.screenshot({ path: '/tmp/workbench-ui-overview.png' });
      await page
        .locator('.tabs')
        .getByRole('button', { name: 'Neighborhood', exact: true })
        .click();
      await expectNeighborhood();
    },
  );
  await check(
    'actual graph retains all entities, routes connections and keeps overview accessible',
    async () => {
      await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
      await page.getByRole('button', { name: 'Fit model', exact: true }).click();
      await page.waitForTimeout(400);
      await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '45');
      await expect(page.locator('.full-graph-status')).toHaveAttribute(
        'data-relationship-count',
        '277',
      );
      await showEveryEntity(page);
      await expect(page.locator('.react-flow__node-entity')).toHaveCount(45);
      await expect(page.locator('.react-flow__edge')).toHaveCount(183);
      await viewOptions(page, async options => {
        const layout = options.getByLabel('Graph layout');
        await expect(layout).toHaveValue('layered');
        await layout.selectOption('network');
      });
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
      await expect(page.locator('.react-flow__node-entity')).toHaveCount(45);
      await expect(page.locator('.react-flow__edge')).toHaveCount(183);
      await expect(page.locator('.full-graph-status')).toHaveAttribute('data-routing', 'worker', {
        timeout: 30000,
      });
      await viewOptions(page, async options => {
        await options.getByLabel('Zoom to group').selectOption('documents');
      });
      await page.waitForTimeout(500);
      await page.locator('.react-flow__node[data-id="ontology/0"] .full-entity').click();
      await expect(page.locator('.inspector h2')).toHaveText('Order');
      await page.getByRole('button', { name: 'Close details', exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
      await expect(page.locator('.area-entities button')).toHaveCount(45);
      await page
        .locator('.tabs')
        .getByRole('button', { name: 'Neighborhood', exact: true })
        .click();
      await expectNeighborhood();
    },
  );
  await check('JSON upload and export retain JSON syntax and filename', async () => {
    const source = JSON.stringify(
      {
        name: 'JSON round trip',
        ontology: [{ concept: 'Customer', type: 'EntityType', description: 'Kept as JSON' }],
      },
      null,
      2,
    );
    await page.locator('input[type=file]').setInputFiles({
      name: 'roundtrip.json',
      mimeType: 'application/json',
      buffer: Buffer.from(source),
    });
    await expect(page.getByRole('button', { name: 'roundtrip.json', exact: true })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), exportFile(page)]);
    if (download.suggestedFilename() !== 'roundtrip.json')
      throw Error('JSON export filename changed');
    const path = await download.path();
    if (!path) throw Error('No JSON download');
    const exported = await readFile(path, 'utf8');
    if (exported !== source || JSON.parse(exported).ontology[0].description !== 'Kept as JSON')
      throw Error('JSON export changed');
  });
  await check(
    'invalid import preserves workspace, reports errors and cancels with keyboard',
    async () => {
      const before = store.list().length;
      const heading = await page.locator('h1').innerText();
      await page.locator('input[type=file]').setInputFiles({
        name: 'broken.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from('name: Broken\nontology: [{concept: A, extends: [Missing]}]'),
      });
      const dialog = page.getByRole('dialog', { name: 'Review import' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Unknown parent concept');
      await expect(dialog.getByRole('button', { name: 'Import repaired files' })).toBeDisabled();
      if (store.list().length !== before) throw Error('Invalid import wrote to the workspace');
      await page.screenshot({ path: '/tmp/workbench-validation-import.png' });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('h1')).toHaveText(heading);
      if (store.list().length !== before) throw Error('Cancel changed the workspace');
    },
  );
  await check(
    'mixed batch preflights all files and repairs without losing valid source',
    async () => {
      const before = store.list().length;
      const good = 'name: Batch valid\nontology: [{concept: Good}]';
      await page.locator('input[type=file]').setInputFiles([
        { name: 'batch-good.yaml', mimeType: 'application/yaml', buffer: Buffer.from(good) },
        {
          name: 'batch-bad.json',
          mimeType: 'application/json',
          buffer: Buffer.from('{"ontology":['),
        },
      ]);
      const dialog = page.getByRole('dialog', { name: 'Review import' });
      await expect(dialog).toBeVisible();
      if (store.list().length !== before) throw Error('Mixed batch partially saved before repair');
      await dialog.getByLabel('File to review').selectOption('1');
      await expectEditorValue(dialog.getByLabel('Repair definition'), '{"ontology":[');
      await fillEditor(
        dialog.getByLabel('Repair definition'),
        '{"name":"Repaired","ontology":[{"concept":"Fixed"}]}',
      );
      await expect(dialog.getByRole('button', { name: 'Import repaired files' })).toBeEnabled();
      await dialog.getByLabel('Import filename').fill('../bad.json');
      await expect(dialog.getByRole('button', { name: 'Import repaired files' })).toBeDisabled();
      await dialog.getByLabel('Import filename').fill('batch-repaired.json');
      await dialog.getByLabel('File to review').selectOption('0');
      await expectEditorValue(dialog.getByLabel('Repair definition'), good);
      await dialog.getByRole('button', { name: 'Import repaired files' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('h1')).toHaveText('Repaired');
      if (store.list().length !== before + 2) throw Error('Repaired batch not saved');
      const saved = store.list().find((d: any) => d.filename === 'batch-good.yaml') as any;
      if (saved.source !== good) throw Error('Valid batch file changed');
      await expect(page.locator('.react-flow__node').first()).toBeVisible();
    },
  );
  await check(
    'invalid source blocks save, retains saved bytes and recovers in the same editor',
    async () => {
      await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
      const editor = page.getByLabel('Definition source');
      const original = await editorValue(editor);
      const saved = store.list().find((d: any) => d.filename === 'batch-repaired.json') as any;
      await fillEditor(editor, '');
      await expect(editor).toBeVisible();
      await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(
        /^Not saved: \d+ errors?$/,
        { timeout: 5000 },
      );
      // Findings open in the Validation details dialog from the Save state indicator.
      await page.getByRole('status', { name: 'Save state' }).click();
      await expect(page.locator('.validation-details')).toContainText('definition is empty');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Validation details' })).toHaveCount(0);
      await fillEditor(editor, '{"name":"Invalid","ontology":[{"concept":"A","extends":["A"]}]}');
      await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(
        /^Not saved: \d+ errors?$/,
        { timeout: 5000 },
      );
      await page.getByRole('status', { name: 'Save state' }).click();
      await expect(page.locator('.validation-details')).toContainText('Cyclic inheritance');
      await page
        .locator('.validation-details')
        .getByRole('button', { name: 'Go to line 1' })
        .first()
        .click();
      await expect(editor).toBeFocused();
      if ((store.list().find((d: any) => d.id === saved.id) as any).source !== original)
        throw Error('Invalid edit overwrote saved source');
      await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Repair in Source' })).toBeVisible();
      await page.getByRole('button', { name: 'Repair in Source' }).click();
      await expect(editor).toContainText('Invalid');
      await fillEditor(editor, original);
      await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(/^Saved to file/, {
        timeout: 5000,
      });
      await page.getByRole('button', { name: /^Validation details/ }).click();
      await expect(page.locator('.validation-details')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.validation-details')).toHaveCount(0);
      await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
      await expect(page.locator('.area-entities button')).toHaveCount(1);
      await page.screenshot({ path: '/tmp/workbench-validation-recovered.png' });
    },
  );
  await check(
    'invalid ODCS, semantic, RDF, XML, OWL, SHACL and N-Triples use the repair flow',
    async () => {
      const before = store.list().length;
      for (const [name, source] of [
        [
          'invalid.odcs.yaml',
          'kind: DataContract\napiVersion: v3.1.0\nid: x\nversion: "1"\nschema: [{name: x}]',
        ],
        ['invalid.ossie.yaml', 'name: Bad\ndatasets: [{name: x}]'],
        ['invalid.ttl', '@prefix ex: <https://example.org/> . ex:a ex:p'],
        ['invalid.rdf', '<rdf:RDF'],
        [
          'invalid.owl',
          '@prefix owl: <http://www.w3.org/2002/07/owl#> . <urn:r> a owl:Restriction .',
        ],
        [
          'invalid.shacl',
          '@prefix sh: <http://www.w3.org/ns/shacl#> . <urn:s> a sh:PropertyShape .',
        ],
        ['invalid.nt', '@prefix ex: <https://example.org/> . ex:a ex:p ex:b .'],
      ]) {
        await page
          .locator('input[type=file]')
          .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(source) });
        const dialog = page.getByRole('dialog', { name: 'Review import' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Import repaired files' })).toBeDisabled();
        await expect(dialog.locator('.validation-report li.error').first()).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancel import' }).click();
        await expect(dialog).toHaveCount(0);
      }
      if (store.list().length !== before) throw Error('Invalid formats were persisted');
    },
  );
  await check('API failure retains repaired draft and permits retry', async () => {
    const before = store.list().length;
    const heading = await page.locator('h1').innerText();
    await page.locator('input[type=file]').setInputFiles({
      name: 'retry.ttl',
      mimeType: 'text/turtle',
      buffer: Buffer.from('@prefix ex:'),
    });
    const dialog = page.getByRole('dialog', { name: 'Review import' });
    await fillEditor(
      dialog.getByLabel('Repair definition'),
      '<https://example.org/a> <https://example.org/p> "Recovered" .',
    );
    failNextSave = true;
    await dialog.getByRole('button', { name: 'Import repaired files' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Could not save retry.ttl');
    await expect(dialog.getByLabel('Repair definition')).toContainText('Recovered');
    await expect(page.locator('h1')).toHaveText(heading);
    if (store.list().length !== before) throw Error('Failed save changed the workspace');
    await dialog.getByRole('button', { name: 'Import repaired files' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'retry.ttl', exact: true })).toBeVisible();
    if (store.list().length !== before + 1) throw Error('Retry failed');
  });
  await check(
    'mapped commerce exposes separate layers and composes governed revenue by region',
    async () => {
      await (await example(page, /Load mapped commerce/)).click();
      await expect(page.locator('.mapping-layer-chain')).toContainText('Mapped commerce ontology');
      await expect(page.locator('.mapping-layer-chain')).toContainText(
        'Mapped commerce semantic model',
      );
      await expect(page.locator('.mapping-binding')).toHaveCount(9);
      await page
        .locator('.mapping-concepts')
        .getByRole('button', { name: /^Revenue/ })
        .click();
      await expect(page.locator('.mapping-binding')).toHaveCount(1);
      await expect(page.locator('.mapping-binding')).toContainText('gross_revenue');
      await page.getByRole('button', { name: 'All concepts', exact: true }).click();
      await openComposer(page);
      await page.getByRole('checkbox', { name: 'Metric gross_revenue', exact: true }).check();
      await page.getByRole('checkbox', { name: 'Dimension customers.region', exact: true }).check();
      await page.getByRole('button', { name: 'Preview governed query', exact: true }).click();
      await expect(page.getByLabel('Governed SQL preview')).toContainText('SUM("orders".amount)');
      await expect(page.getByLabel('Governed SQL preview')).toContainText(
        'GROUP BY "customers".region',
      );
      await expect(page.getByLabel('Governed SQL preview')).toContainText('LEFT JOIN');
      await page.getByLabel('Governed SQL preview').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/workbench-mapping-query.png' });
      await closeComposer(page);
    },
  );
  await check(
    'agent context download retains mapping provenance and governed formulas',
    async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export agent context', exact: true }).click(),
      ]);
      if (download.suggestedFilename() !== 'agent-context.json')
        throw Error('Wrong context filename');
      const path = await download.path();
      if (!path) throw Error('Missing context download');
      const context = JSON.parse(await readFile(path, 'utf8'));
      if (
        context.bindings.length !== 9 ||
        context.aiContext.length !== 2 ||
        context.documents.length !== 3
      )
        throw Error('Context layers missing');
      if (
        context.metrics.find((m: any) => m.name === 'gross_revenue')?.definition.expression
          .dialects[0].expression !== 'SUM(orders.amount)'
      )
        throw Error('Governed formula changed');
      if (
        !context.bindings.every(
          (b: any) => b.evidence.documentId && b.evidence.path.length && b.evidence.revision,
        )
      )
        throw Error('Provenance lost');
      await page.locator('.mapping-explorer').evaluate(el => (el.scrollTop = 0));
      await page.screenshot({ path: '/tmp/workbench-mapping-layers.png' });
    },
  );
  await check(
    'mapping runtime reports missing targets and refreshes on repaired saved references',
    async () => {
      await page.getByRole('button', { name: 'commerce.mapping.yaml', exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
      const editor = page.getByLabel('Definition source');
      const original = await editorValue(editor);
      await fillEditor(editor, original.replace('Mapped commerce ontology', 'Missing ontology'));
      await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(/^Saved to file/, {
        timeout: 5000,
      });
      await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
      await expect(page.locator('.mapping-findings')).toContainText('0 local documents');
      await openComposer(page);
      await expect(
        page.getByRole('button', { name: 'Preview governed query', exact: true }),
      ).toBeDisabled();
      await closeComposer(page);
      await page.screenshot({ path: '/tmp/workbench-mapping-unresolved.png' });
      await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
      await fillEditor(editor, original);
      await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(/^Saved to file/, {
        timeout: 5000,
      });
      await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
      await expect(page.locator('.mapping-binding')).toHaveCount(9);
      await expect(page.locator('.mapping-findings')).toHaveCount(0);
      await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
      await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '45');
    },
  );
  await check(
    'changing mapping documents selects the requested mapping rather than a previous context',
    async () => {
      const original = (
        store.list().find((d: any) => d.filename === 'commerce.mapping.yaml') as any
      ).source;
      await store.save(
        'commerce.second.mapping.yaml',
        original.replace('name: Commerce ontology mapping', 'name: Second commerce mapping'),
      );
      await page.reload();
      await page.getByRole('button', { name: 'commerce.second.mapping.yaml', exact: true }).click();
      await expect(page.locator('.mapping-layer-chain')).toContainText('Second commerce mapping');
      await page.getByRole('button', { name: 'commerce.mapping.yaml', exact: true }).click();
      await expect(page.getByLabel('Mapping document').locator('option:checked')).toHaveText(
        'Commerce ontology mapping',
      );
      await expect(page.locator('.mapping-layer-chain')).not.toContainText(
        'Second commerce mapping',
      );
    },
  );
  await check('late query responses cannot overwrite a changed concept selection', async () => {
    await openComposer(page);
    await expect(
      page.getByRole('checkbox', { name: 'Metric gross_revenue', exact: true }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: 'Metric gross_revenue', exact: true }).check();
    holdPlan = true;
    releasePlan = null;
    await page.getByRole('button', { name: 'Preview governed query', exact: true }).click();
    await expect.poll(() => releasePlan !== null).toBe(true);
    await closeComposer(page);
    await page
      .locator('.mapping-concepts')
      .getByRole('button', { name: /^Customer/ })
      .click();
    releasePlan!();
    await page.waitForTimeout(200);
    await expect(page.locator('.mapping-detail>h3')).toHaveText('Customer');
    // The late answer was for the previous selection, so the reopened composer shows no SQL.
    await openComposer(page);
    await expect(page.getByLabel('Governed SQL preview')).toHaveCount(0);
    await closeComposer(page);
  });
  await check('no browser runtime errors', async () => {
    if (errors.length) throw Error(errors.join('\n'));
  });
  console.log(`${passed} UI checks passed`);
} finally {
  await browser.close();
  await api.stop();
}
