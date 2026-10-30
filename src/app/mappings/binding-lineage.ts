/** Turns the bindings of a mapping context into the lineage the "Where a concept lives" card shows, one block per dataset. */
import type { Binding, RuntimeContext } from '../../server/agent/runtime';

/** One box of a binding's chain, such as Field: orders.id. */
export type LineageStep = { label: string; value: string };

/** A binding as one dataset sees it: the chain from concept to physical source, the expression and where the mapping file says it. */
export type BindingLineage = {
  id: string;
  steps: LineageStep[];
  expression: string;
  conditional: boolean;
  documentId: string;
  filename: string;
  path: (string | number)[];
  /** The JSON pointer of the expression in the mapping file. */
  pointer: string;
};

/** The bindings that read fields of one dataset. */
export type DatasetLineage = { dataset: string; source: string; bindings: BindingLineage[] };

/** How many bindings a dataset block shows before Show all. */
export const BINDINGS_SHOWN = 2;

const UNRESOLVED_SOURCE = 'Unresolved';

/** Writes a path as a JSON pointer, escaping the characters the pointer syntax reserves. */
export function jsonPointer(path: (string | number)[]) {
  return path.map(part => `/${String(part).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

function conceptSteps(binding: Binding): LineageStep[] {
  const steps: LineageStep[] = [{ label: 'Concept', value: binding.rootConcept }];
  for (const relationship of binding.relationships) steps.push({ label: 'Relationship', value: relationship });
  if (binding.concept !== binding.rootConcept) steps.push({ label: 'Concept', value: binding.concept });
  return steps;
}

function lineageIn(binding: Binding, dataset: string, fieldNames: string[], source: string): BindingLineage {
  const steps = [...conceptSteps(binding), { label: 'Field', value: fieldNames.join(', ') }, { label: 'Dataset', value: dataset }, { label: 'Physical source', value: source }];
  return {
    id: binding.id,
    steps,
    expression: binding.expression,
    conditional: Boolean(binding.condition),
    documentId: binding.evidence.documentId,
    filename: binding.evidence.filename,
    path: binding.evidence.path,
    pointer: jsonPointer(binding.evidence.path),
  };
}

/** Groups the bindings by the dataset whose fields they read, in the order the datasets first appear. A binding that reads two datasets is listed in both. */
export function datasetLineages(context: Pick<RuntimeContext, 'bindings' | 'fields' | 'datasets'>): DatasetLineage[] {
  const fieldsById = new Map(context.fields.map(field => [field.id, field]));
  const sourceOf = (dataset: string) => context.datasets.find(candidate => candidate.name === dataset)?.source ?? UNRESOLVED_SOURCE;
  const groups = new Map<string, DatasetLineage>();
  for (const binding of context.bindings) {
    const namesByDataset = new Map<string, string[]>();
    for (const id of binding.fields) {
      const field = fieldsById.get(id);
      if (!field) continue;
      namesByDataset.set(field.dataset, [...(namesByDataset.get(field.dataset) ?? []), `${field.dataset}.${field.name}`]);
    }
    for (const [dataset, names] of namesByDataset) {
      const group: DatasetLineage = groups.get(dataset) ?? { dataset, source: sourceOf(dataset), bindings: [] };
      group.bindings.push(lineageIn(binding, dataset, names, group.source));
      groups.set(dataset, group);
    }
  }
  return [...groups.values()];
}

/** Says how many bindings a dataset holds, as "19 bindings". */
export function bindingCountText(count: number) {
  return `${count} ${count === 1 ? 'binding' : 'bindings'}`;
}

/** Label for the control that shows every binding of a dataset. */
export function showAllBindingsLabel(count: number, dataset: string) {
  return `Show all ${count} bindings in ${dataset}`;
}
