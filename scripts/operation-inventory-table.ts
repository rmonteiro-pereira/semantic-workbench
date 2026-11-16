// Renders the reviewed operation contract as its public reference table.
import { operationInventory, type OperationInventory } from '../src/server/auth/operation-inventory';

function cell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** Builds the deterministic documentation view of the operation inventory. */
export function operationInventoryTable(inventory: OperationInventory = operationInventory): string {
  const lines = [
    '# Operations',
    '',
    'This reference describes the shared operation boundary. It does not imply that a protocol transport is available.',
    'Regenerate this page with `bun scripts/operation-inventory-table.ts` after reviewing the inventory.',
    '',
    '| Operation | Route | Action | Targets | Effects | Request limit | Exposure |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const [route, entry] of Object.entries(inventory.operations)) {
    lines.push('| ' + [entry.id, route, entry.action, entry.targets, entry.effects.join(', '), entry.limits.request, entry.exposure.increment].map(cell).join(' | ') + ' |');
  }
  lines.push('', '## Browser capabilities', '', '| Capability | Status | Reason | Exposure | Source |', '| --- | --- | --- | --- | --- |');
  for (const entry of inventory.browserCapabilities) {
    lines.push('| ' + [entry.id, entry.status, entry.reason, entry.increment, entry.source].map(cell).join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

if (import.meta.main) await Bun.write(new URL('../docs/operations.md', import.meta.url), operationInventoryTable());
