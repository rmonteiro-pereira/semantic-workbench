// Renders the reviewed operation contract as its public reference table.
import { ROUTE_ACTIONS, routeResourceKind } from '../src/server/auth/route-actions';
import { operationInventory, type OperationInventory } from '../src/server/auth/operation-inventory';

function cell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** Builds the deterministic documentation view of the operation inventory. */
export function operationInventoryTable(inventory: OperationInventory = operationInventory): string {
  const lines = [
    '# Operation inventory',
    '',
    'This reference describes the shared operation boundary. It does not imply that a protocol transport is available.',
    'Regenerate this page with `bun scripts/operation-inventory-table.ts` after reviewing the inventory.',
    '',
    '| Operation | Route | Action | Targets | Effects | Request limit | Exposure |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const [route, entry] of Object.entries(inventory.operations)) {
    const row = ROUTE_ACTIONS.find(row => row.path === route);
    if (!row) throw new Error(`Missing route ${route}.`);
    lines.push('| ' + [entry.id, route, row.action, row.targets ?? routeResourceKind(row), entry.effects.join(', '), entry.limits.request, entry.exposure.increment].map(cell).join(' | ') + ' |');
  }
  lines.push(
    '',
    '## Internal publication steps',
    '',
    'These steps run inside the admitted route and share its authorization and audit outcome.',
    '',
    '| Operation | Internal steps |',
    '| --- | --- |',
  );
  for (const entry of Object.values(inventory.operations)) {
    if (entry.steps?.length) lines.push('| ' + [entry.id, entry.steps.join(', ')].map(cell).join(' | ') + ' |');
  }
  lines.push('', '## Content guards', '', 'These actions apply after the write operation is admitted.', '', '| Guard | Policy action |', '| --- | --- |');
  for (const [kind, action] of Object.entries(inventory.contentGuardActions)) lines.push(`| ${kind} | ${action} |`);
  lines.push('', '## Workspace lifecycle', '', '| Operation | Effects | Entry point | Dispatch |', '| --- | --- | --- | --- |');
  for (const entry of Object.values(inventory.lifecycleOperations)) {
    lines.push('| ' + [entry.id, entry.effects.join(', '), entry.entryPoint, entry.reason].map(cell).join(' | ') + ' |');
  }
  lines.push('', '## Browser capabilities', '', '| Capability | Status | Reason | Exposure | Source |', '| --- | --- | --- | --- | --- |');
  for (const entry of inventory.browserCapabilities) {
    lines.push('| ' + [entry.id, entry.status, entry.reason, entry.increment, entry.source].map(cell).join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

if (import.meta.main) await Bun.write(new URL('../docs/operations.md', import.meta.url), operationInventoryTable());
