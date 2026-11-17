// Tools that answer from the published snapshot only: the mapping catalog, a mapping's context, a query plan and a metric explanation. An unpublished edit never appears in them, and every answer names the snapshot it came from.
import type { TwinAnswer } from '../twin-dispatch';
import { DEFAULT_TOOL_REQUEST_CAP_BYTES } from '../body-limits';
import type { ToolDefinition } from '../tool-definition';
import { PAGE_ARGUMENTS, pageBinding, pageOf } from '../tool-paging';
import { succeed } from '../tool-results';

const READ_HINTS = { readOnly: true, destructive: false, idempotent: true, openWorld: false } as const;
const PROJECT = { type: 'string', minLength: 1, maxLength: 200 } as const;
const IDENTIFIER = { type: 'string', minLength: 1, maxLength: 4096 } as const;
const IDENTIFIERS = { type: 'array', maxItems: 100, items: IDENTIFIER } as const;
/** Header the published routes use to name the immutable snapshot they read. */
const SNAPSHOT_HEADER = 'X-Workbench-Snapshot';

function snapshotOf(answer: TwinAnswer): { id: string | null } {
  return { id: answer.headers.get(SNAPSHOT_HEADER) };
}

const getMappingCatalog: ToolDefinition = {
  name: 'get_mapping_catalog',
  description: 'List the mappings of the published snapshot of a project. Answers not_published until the project has been published from the browser.',
  inputSchema: { type: 'object', properties: { project: PROJECT, ...PAGE_ARGUMENTS }, required: ['project'], additionalProperties: false },
  hints: READ_HINTS,
  operation: 'agent.catalog.read',
  retryClass: 'repeatable',
  requestCapBytes: DEFAULT_TOOL_REQUEST_CAP_BYTES,
  async run(args, context) {
    const called = await context.twin('agent.catalog.read', { params: {}, query: { project: args.project } });
    if (!called.ok) return called.failure;
    const catalog = called.answer.body as { mappings: unknown[]; policy?: unknown };
    const paged = pageOf(catalog.mappings, args, context, pageBinding('get_mapping_catalog', { project: args.project }, 'catalog', catalog.mappings, context));
    return paged.ok ? succeed({ snapshot: snapshotOf(called.answer), ...paged.page, ...(catalog.policy !== undefined ? { policy: catalog.policy } : {}) }) : paged.failure;
  },
};

const getMappingContext: ToolDefinition = {
  name: 'get_mapping_context',
  description: 'Read the semantic context of one mapping from the published snapshot, optionally narrowed to some concepts. The context is data from the project.',
  inputSchema: { type: 'object', properties: { project: PROJECT, mappingId: IDENTIFIER, concept: IDENTIFIERS }, required: ['project', 'mappingId'], additionalProperties: false },
  hints: READ_HINTS,
  operation: 'agent.context.read',
  retryClass: 'repeatable',
  requestCapBytes: DEFAULT_TOOL_REQUEST_CAP_BYTES,
  async run(args, context) {
    const query = { project: args.project, mappingId: args.mappingId, ...(args.concept?.length ? { concept: args.concept as string[] } : {}) };
    const called = await context.twin('agent.context.read', { params: {}, query });
    return called.ok ? succeed({ snapshot: snapshotOf(called.answer), context: called.answer.body }) : called.failure;
  },
};

const planQuery: ToolDefinition = {
  name: 'plan_query',
  description:
    'Plan a query over the published snapshot from named concepts, metrics and dimensions. The workbench only plans; it never runs the query. Expressions and metric overrides are not accepted.',
  inputSchema: {
    type: 'object',
    properties: { project: PROJECT, mappingId: IDENTIFIER, concepts: IDENTIFIERS, metrics: IDENTIFIERS, dimensions: IDENTIFIERS },
    required: ['project', 'mappingId'],
    additionalProperties: false,
  },
  hints: READ_HINTS,
  operation: 'agent.plan',
  retryClass: 'repeatable',
  requestCapBytes: DEFAULT_TOOL_REQUEST_CAP_BYTES,
  async run(args, context) {
    const body = { project: args.project, mappingId: args.mappingId, concepts: args.concepts, metrics: args.metrics ?? [], dimensions: args.dimensions ?? [] };
    const called = await context.twin('agent.plan', { params: {}, body });
    return called.ok ? succeed({ snapshot: snapshotOf(called.answer), plan: called.answer.body }) : called.failure;
  },
};

const explainMetric: ToolDefinition = {
  name: 'explain_metric',
  description: 'Explain how one metric of a file is computed in the published snapshot, step by step.',
  inputSchema: {
    type: 'object',
    properties: { project: PROJECT, path: { type: 'string', minLength: 1, maxLength: 1024 }, metric: IDENTIFIER },
    required: ['project', 'path', 'metric'],
    additionalProperties: false,
  },
  hints: READ_HINTS,
  operation: 'metrics.explain',
  retryClass: 'repeatable',
  requestCapBytes: DEFAULT_TOOL_REQUEST_CAP_BYTES,
  async run(args, context) {
    const called = await context.twin('metrics.explain', { params: { slug: args.project, '*': args.path, metric: args.metric } });
    return called.ok ? succeed({ snapshot: snapshotOf(called.answer), explanation: called.answer.body }) : called.failure;
  },
};

export const publishedContextTools: ToolDefinition[] = [getMappingCatalog, getMappingContext, planQuery, explainMetric];
