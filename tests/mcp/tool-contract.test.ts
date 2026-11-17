// The registry equals the tool contract: names, order, name length, hints, retry classes, actions and twin routes.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { operationById } from '../../src/server/auth/operation-inventory';
import { ROUTE_ACTIONS } from '../../src/server/auth/route-actions';
import { TOOLS } from '../../src/server/mcp/tool-registry';

type ContractRow = { name: string; route: string; action: string; hints: boolean[]; retry: string };

/** The table of the tool contract, one entry per tool. */
export function contractRows(): ContractRow[] {
  const text = readFileSync('specs/006-mcp-server/contracts/mcp-tools.md', 'utf8');
  return text
    .split('\n')
    .filter(line => /^\| `[a-z_]+` \| `/.test(line))
    .map(line => {
      const cells = line.split('|').map(cell => cell.trim().replaceAll('`', ''));
      return { name: cells[1], route: cells[2], action: cells[3], hints: cells.slice(4, 8).map(cell => cell === 'true'), retry: cells[8] };
    });
}

/** The contract abbreviates the project prefix, and names a new route or a null base in words. */
function normalizedRoute(route: string): string {
  return route.replace('/api/projects/:slug', '...').replace(/ \(new\)$/, '').replace(/ with null base$/, '');
}

test('the registry lists the contract tools, sorted, with short names', () => {
  const rows = contractRows();
  expect(rows).toHaveLength(21);
  expect(TOOLS.map(tool => tool.name)).toEqual(rows.map(row => row.name).sort());
  expect(TOOLS.map(tool => tool.name)).toEqual([...TOOLS.map(tool => tool.name)].sort());
  for (const tool of TOOLS) expect(tool.name.length).toBeLessThanOrEqual(40);
});

test('hints, retry classes, actions and twin routes equal the contract', () => {
  for (const row of contractRows()) {
    const tool = TOOLS.find(candidate => candidate.name === row.name)!;
    expect([tool.hints.readOnly, tool.hints.destructive, tool.hints.idempotent, tool.hints.openWorld], row.name).toEqual(row.hints);
    expect<string>(tool.retryClass, row.name).toBe(row.retry);
    const twin = operationById(tool.operation)!;
    expect(normalizedRoute(twin.row.replace('/api/projects/:slug', '...')), row.name).toBe(normalizedRoute(row.route));
    expect<string>(ROUTE_ACTIONS.find(candidate => candidate.path === twin.row)!.action, row.name).toBe(row.action);
  }
});

test('every tool schema forbids unknown arguments', () => {
  for (const tool of TOOLS) expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
});
