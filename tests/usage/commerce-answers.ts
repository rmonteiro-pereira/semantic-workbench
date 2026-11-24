// Builds real context, plan and explanation answers of the commerce example for the usage tests.
import { buildContext, planQuery, wholeContext } from '../../src/server/agent/runtime';
import { explainMetric } from '../../src/server/agent/explain';
import { parseDocuments } from '../../src/server/agent/context-documents';

export const PROJECT = 'shop';
export const MAPPING_ID = `${PROJECT}/commerce.mapping.yaml`;
export const SEMANTIC_PATH = 'commerce.mapped-semantic.yaml';
const FILES = ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', SEMANTIC_PATH];

/** The three published documents of the commerce example, stored as a project would serve them. */
export async function commerceDocuments(): Promise<any[]> {
  return Promise.all(
    FILES.map(async filename => ({
      id: `${PROJECT}/${filename}`,
      filename,
      path: filename,
      project: PROJECT,
      revision: 1,
      source: await Bun.file('public/examples/commerce/' + filename).text(),
    })),
  );
}

/** Parsed models keyed by document id, as the recorder receives them. */
export function modelsOf(documents: any[]): Map<string, any> {
  return new Map(parseDocuments(documents).map(parsed => [parsed.doc.id, parsed.data]));
}

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));

/** The answer of `GET /api/agent/context` for the whole mapping. */
export function contextAnswer(documents: any[]) {
  return asJson(wholeContext(buildContext(documents, MAPPING_ID)));
}

/** The answer of `POST /api/agent/plan` for gross revenue by customer region. */
export function planAnswer(documents: any[]) {
  const plan = planQuery(buildContext(documents, MAPPING_ID), { mappingId: MAPPING_ID, metrics: ['gross_revenue'], dimensions: [JSON.stringify(['customers', 'region'])] });
  return asJson(plan);
}

/** The answer of the metric explanation route for gross revenue. */
export function explainAnswer(documents: any[]) {
  return asJson(explainMetric(documents, PROJECT, SEMANTIC_PATH, 'gross_revenue'));
}
