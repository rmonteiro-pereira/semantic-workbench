// Supplies identical published and unpublished definitions to baseline and isolation proofs.
import { readFileSync } from 'node:fs';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { publishFixture } from './published-workspace';
import { testWorkspace } from './temp-data-dir';

/** Creates a published comparison project and saves unpublished definitions on a branch. */
export async function itemDiffBaselineWorkspace() {
  const fixture = await testWorkspace({ watch: false });
  try {
    const files = ['finance.ontology.yaml', 'finance.semantic.yaml'].map(path => ({ path, source: readFileSync(new URL(`../fixtures/item-diff/${path}`, import.meta.url), 'utf8') }));
    for (const path of ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml']) {
      files.push({ path, source: readFileSync(`public/examples/commerce/${path}`, 'utf8') });
    }
    await fixture.seed(files, 'Finance');
    await publishFixture(fixture);
    const result = Bun.spawnSync(['git', 'switch', '-c', 'work/comparison'], { cwd: `${fixture.root}/projects/finance` });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    for (const path of ['finance.ontology.yaml', 'commerce.mapped-semantic.yaml']) {
      const before = fixture.ws.readFile('finance', path, LOCAL_READER);
      const source = before.source.replace('A buyer.', 'An unpublished buyer.').replace('SUM(orders.amount)', 'SUM(orders.amount) + 987');
      await fixture.ws.saveFile('finance', path, { baseHash: before.hash, source }, LOCAL_READER);
    }
    return fixture;
  } catch (error) {
    fixture.dispose();
    throw error;
  }
}

/** Reads byte-stable consumer responses through the operation boundary. */
export async function itemDiffAgentAnswers(fixture: Awaited<ReturnType<typeof itemDiffBaselineWorkspace>>) {
  const requests = {
    context: new Request('http://localhost:5173/api/agent/context?project=finance&mappingId=finance/commerce.mapping.yaml'),
    plan: new Request('http://localhost:5173/api/agent/plan', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'X-SW-Request': '1' },
      body: JSON.stringify({ project: 'finance', mappingId: 'finance/commerce.mapping.yaml', metrics: ['gross_revenue'], dimensions: [] }),
    }),
    explanation: new Request('http://localhost:5173/api/projects/finance/files/commerce.mapped-semantic.yaml/explain/gross_revenue'),
  };
  const answers: Record<string, string> = {};
  for (const [name, request] of Object.entries(requests)) {
    const response = await fixture.handler(request);
    const body = await response.text();
    if (response.status !== 200) throw new Error(`${name}: ${response.status} ${body}`);
    answers[name] = body;
  }
  return answers;
}
