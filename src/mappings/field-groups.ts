/** Groups the mapped fields of a query composer by dataset, after a text filter. */
import type { RuntimeContext } from '../../server/agent/runtime';

type Field = RuntimeContext['fields'][number];

export type FieldGroup = { dataset: string; fields: Field[] };

/** Keeps the fields whose dataset or name contains the text, and groups them by dataset. */
export function groupFieldsByDataset(fields: Field[], filterText: string): FieldGroup[] {
  const term = filterText.trim().toLocaleLowerCase();
  const groups = new Map<string, Field[]>();
  for (const field of fields) {
    const label = `${field.dataset}.${field.name}`.toLocaleLowerCase();
    if (term && !label.includes(term)) continue;
    groups.set(field.dataset, [...(groups.get(field.dataset) ?? []), field]);
  }
  return [...groups.entries()].map(([dataset, members]) => ({ dataset, fields: members }));
}
