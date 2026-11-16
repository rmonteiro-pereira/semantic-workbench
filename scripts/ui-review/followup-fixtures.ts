// Loads public examples and existing browser-check fixtures. Imported by followup-local; no arguments or environment variables.
import { readFileSync } from 'node:fs';
import type { IsolatedApi } from '../helpers/isolated-api';
import { LOCAL_READER } from '../../src/server/projects/reader';

/** Seeds the real temporary workspace with example, zero-binding, and bundled-line documents. */
export async function loadFollowupFixtures(api: IsolatedApi) {
  for (const example of ['ubl', 'commerce', 'mapped-commerce', 'mall']) await api.ws.loadExample(example);
  const mapping = readFileSync('public/examples/commerce/commerce.mapping.yaml', 'utf8');
  const empty = mapping.split('concept_mappings:')[0].replace('name: Commerce ontology mapping', 'name: Unbound mapping regression') + 'concept_mappings: []\n';
  const names = ['commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml', 'commerce.mapping.yaml'];
  await api.ws.importBatch(
    { name: 'Unbound commerce', files: names.map(path => ({ path, source: path === 'commerce.mapping.yaml' ? empty : readFileSync('public/examples/commerce/' + path, 'utf8') })) },
    LOCAL_READER,
  );
  const columns = Array.from({ length: 9 }, (_, index) => `measure_${index + 1}`);
  const contract = [
    'apiVersion: v3.1.0',
    'kind: DataContract',
    'id: 2f6c3e0a-8b1d-4c55-9a77-1d2e3f4a5b6c',
    'name: Wide contract',
    'version: 1.0.0',
    'status: active',
    'schema:',
    '  - name: wide_table',
    '    physicalName: analytics.wide_table',
    '    physicalType: table',
    '    logicalType: object',
    '    properties:',
    ...columns.flatMap(column => [`      - name: ${column}`, '        logicalType: number']),
    '',
  ].join('\n');
  const model = [
    'version: 0.2.0.dev0',
    'name: Wide model',
    'datasets:',
    '  - name: wide_view',
    '    source: analytics.wide_table',
    '    fields:',
    ...columns.flatMap(column => [`      - name: ${column}`, '        expression:', '          dialects:', '            - dialect: ANSI_SQL', `              expression: ${column}`]),
    '',
  ].join('\n');
  await api.ws.importBatch(
    {
      name: 'Wide lines',
      files: [
        { path: 'wide.odcs.yaml', source: contract },
        { path: 'wide.semantic.yaml', source: model },
      ],
    },
    LOCAL_READER,
  );
}
