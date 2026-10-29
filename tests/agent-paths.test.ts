// Tests that agent API requests from the browser always name their project.
import { expect, test } from 'bun:test';
import { agentCatalogPath, agentContextPath } from '../src/app/mappings/agent-paths';

test('the catalog and context addresses carry the project', () => {
  expect(agentCatalogPath('sales team')).toBe('/api/agent/catalog?project=sales%20team');
  const address = new URL(agentContextPath('sales', 'sales/a.mapping.yaml#ontology_mappings/0'), 'http://x');
  expect(address.searchParams.get('project')).toBe('sales');
  expect(address.searchParams.get('mappingId')).toBe('sales/a.mapping.yaml#ontology_mappings/0');
});
