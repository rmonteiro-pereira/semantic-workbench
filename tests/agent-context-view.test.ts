// Loads the UBL example into its own project and checks what the Mappings tab would show for it.
import { expect, test } from 'bun:test';
import { agentContextView } from '../src/app/mappings/agent-context-view';
import { mappingsOfProject } from '../src/app/mappings/mapping-choice';
import type { RuntimeContext } from '../src/server/agent/runtime';
import { LOCAL_READER } from '../src/server/projects/reader';
import { testWorkspace } from './helpers/temp-data-dir';

const UBL_PROJECT = 'ubl-business-model';
const UBL_FILES = ['ubl.ontology.yaml', 'ubl.semantic.yaml', 'ubl.semantic-mapping.yaml', 'ubl.odcs.yaml'];

async function loadUblProject() {
  const workspace = await testWorkspace();
  const files = [];
  for (const path of UBL_FILES) files.push({ path, source: await Bun.file(`public/examples/ubl/${path}`).text() });
  await workspace.ws.importBatch({ name: 'UBL business model', files }, LOCAL_READER);
  return workspace;
}

async function readJson(workspace: Awaited<ReturnType<typeof loadUblProject>>, path: string) {
  return (await workspace.handler(new Request('http://localhost' + path))).json();
}

test('the UBL example loads in its project with one mapping, 599 bindings and an AI context that is not empty', async () => {
  const workspace = await loadUblProject();
  try {
    const catalog = await readJson(workspace, `/api/agent/catalog?project=${UBL_PROJECT}`);
    expect(catalog.mappings).toHaveLength(1);
    expect(catalog.mappings[0].project).toBe(UBL_PROJECT);
    const mappingId = encodeURIComponent(catalog.mappings[0].id);
    const context: RuntimeContext = await readJson(workspace, `/api/agent/context?project=${UBL_PROJECT}&mappingId=${mappingId}`);
    expect(context.findings.filter(finding => finding.severity === 'error')).toEqual([]);
    expect(context.bindings).toHaveLength(599);

    const everything = agentContextView(context, '', context.bindings);
    expect(everything.scope).toBe('All concepts');
    expect(everything.concepts.length).toBeGreaterThan(10);
    expect(everything.fields.length).toBeGreaterThan(0);
    expect(everything.metrics.length).toBeGreaterThan(0);

    const invoiceBindings = context.bindings.filter(binding => binding.rootConcept === 'Invoice' || binding.concept === 'Invoice');
    const invoice = agentContextView(context, 'Invoice', invoiceBindings);
    expect(invoice.scope).toBe('Invoice');
    expect(invoice.concepts.map(entry => entry.concept)).toEqual(['Invoice']);
    expect(invoice.concepts[0]!.bindings).toBe(invoiceBindings.length);
    expect(invoice.concepts[0]!.definition).toBeDefined();
    expect(invoice.fields.length).toBeGreaterThan(0);
  } finally {
    workspace.dispose();
  }
});

test('the catalog of another project does not offer the UBL mapping document', async () => {
  const workspace = await loadUblProject();
  try {
    await workspace.ws.importBatch({ name: 'Other project', files: [{ path: 'billing.ontology.yaml', source: await Bun.file('public/examples/billing/billing.ontology.yaml').text() }] }, LOCAL_READER);
    const other = await readJson(workspace, '/api/agent/catalog?project=other-project');
    expect(other.mappings ?? []).toEqual([]);
    const offered = mappingsOfProject([{ id: `${UBL_PROJECT}/ubl.semantic-mapping.yaml`, project: UBL_PROJECT }], 'other-project');
    expect(offered).toEqual([]);
  } finally {
    workspace.dispose();
  }
});
