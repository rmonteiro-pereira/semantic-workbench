// Every route row has a disposition in the MCP inventory contract, and every tool it names is in the registry.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ROUTE_ACTIONS } from '../../src/server/auth/route-actions';
import { TOOLS } from '../../src/server/mcp/tool-registry';

function inventoryRows(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of readFileSync('docs/mcp-contract.md', 'utf8').split('\n')) {
    const match = line.match(/^\| `([A-Z/]+ [^`]+)` \| (.+?) \|/);
    if (match) rows.set(match[1], match[2]);
  }
  return rows;
}

test('the contract and the route table list the same rows', () => {
  const rows = inventoryRows();
  const routes = ROUTE_ACTIONS.filter(row => row.path !== 'GET/HEAD pages').map(row => row.path);
  expect(
    routes.filter(route => !rows.has(route)),
    'rows missing from the contract',
  ).toEqual([]);
  expect(
    [...rows.keys()].filter(route => !routes.includes(route)),
    'stale rows in the contract',
  ).toEqual([]);
  const tools = new Set(TOOLS.map(tool => tool.name));
  let exposed = 0;
  for (const [route, disposition] of rows) {
    const named = disposition.match(/^tool: (.+)$/)?.[1];
    if (!named) continue;
    for (const name of named.split(',').map(entry => entry.trim())) {
      expect(tools.has(name), `${route} names ${name}`).toBe(true);
      exposed++;
    }
  }
  console.log(`MCP inventory: ${routes.length} routes, ${rows.size} contract rows, ${exposed} tool entries, ${tools.size} tools`);
});

test('every tool is the twin of a route the contract names for it', () => {
  const rows = inventoryRows();
  for (const tool of TOOLS) {
    const dispositions = [...rows.values()].filter(value => value.startsWith('tool:') && value.includes(tool.name));
    expect(dispositions.length, tool.name).toBeGreaterThan(0);
  }
});
