/** Defines editable item kinds, field schemas and status rules for each document format. */
import { VENDOR, GRAINS } from '../metrics/extension';
import { isMapping } from '../mappings/mapping-schema';
import { isObject } from './source-text';
// Field paths address either the item or its workbench metric extension. Child lists and insertion
// locations depend on the document format.
/** Names a document item that supports structured editing. */
export type ItemKind = 'concept' | 'ontology-relationship' | 'dataset' | 'field' | 'join' | 'metric' | 'odcs-object' | 'odcs-property' | 'odcs-foreign-key' | 'concept-mapping';
/** Locates a value by mapping keys and list indexes. */
export type Path = (string | number)[];
/** Describes an editable field's path, input type and available choices. */
export type FieldSpec = {
  key: string;
  label: string;
  input: 'text' | 'textarea' | 'select' | 'list' | 'boolean' | 'code';
  at: Path;
  extension?: boolean;
  options?: string[];
  required?: boolean;
  hint?: string;
  when?: (item: any) => boolean;
};
export const kindLabel: Record<ItemKind, string> = {
  concept: 'Concept',
  'ontology-relationship': 'Relationship',
  dataset: 'Dataset',
  field: 'Field',
  join: 'Dataset relationship',
  metric: 'Metric',
  'odcs-object': 'Table',
  'odcs-property': 'Contract property',
  'odcs-foreign-key': 'Foreign key',
  'concept-mapping': 'Concept mapping',
};

/** Identifies the editable kind at a parsed document path. */
export function itemKindAt(document: any, path: Path): ItemKind | null {
  const at = path.length - 2;
  const list = path[at];
  if (typeof path.at(-1) !== 'number') return null;
  if (list === 'ontology') return 'concept';
  if (list === 'relationships') {
    if (path[at - 2] === 'ontology') return 'ontology-relationship';
    if (document?.kind === 'DataContract') return 'odcs-foreign-key';
    return 'join';
  }
  if (list === 'datasets') return 'dataset';
  if (list === 'fields' && path[at - 2] === 'datasets') return 'field';
  if (list === 'metrics') return 'metric';
  if (list === 'schema' && document?.kind === 'DataContract') return 'odcs-object';
  if (list === 'properties' && path[at - 2] === 'schema') return 'odcs-property';
  if (list === 'concept_mappings') return 'concept-mapping';
  return null;
}
/** Returns the field used as the name for an item kind. */
export const nameKey = (kind: ItemKind) => {
  if (kind === 'concept' || kind === 'concept-mapping') {
    return 'concept';
  }
  if (kind === 'odcs-foreign-key') {
    return 'to';
  }
  return 'name';
};
/** Reads the identifying name of an item. */
export function itemName(kind: ItemKind, item: any) {
  const value = item?.[nameKey(kind)];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return '';
}
export const STATUSES = ['draft', 'proposed', 'approved', 'deprecated'] as const;
// Draft → proposed → approved → deprecated; a proposed metric can go back to draft and a
// deprecated one can be proposed again.
/** Returns allowed metric status transitions from the current status. */
export function allowedStatuses(current?: string): string[] {
  if (current === 'proposed') return ['draft', 'proposed', 'approved'];
  if (current === 'approved') return ['approved', 'proposed', 'deprecated'];
  if (current === 'deprecated') return ['deprecated', 'proposed'];
  return ['draft', 'proposed'];
}
/** Supplies concept, dataset and metric names for editor choices. */
export type Choices = { concepts: string[]; datasets: string[]; metrics: string[] };
const ansi: Path = ['expression', 'dialects', 0, 'expression'];
/** Returns the form fields supported by an item kind. */
export function fieldsFor(kind: ItemKind, choices: Choices): FieldSpec[] {
  const field = (key: string, label: string, input: FieldSpec['input'], extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, input, at: extra.at ?? [key], ...extra });
  const ext = (key: string, label: string, input: FieldSpec['input'], extra: Partial<FieldSpec> = {}): FieldSpec =>
    field('ext.' + key, label, input, { at: extra.at ?? [key], extension: true, ...extra });
  switch (kind) {
    case 'concept':
      return [
        field('concept', 'Name', 'text', { required: true }),
        field('type', 'Type', 'select', {
          options: ['EntityType', 'ValueType'],
          required: true,
        }),
        field('description', 'Description', 'textarea'),
        field('extends', 'Extends', 'list', {
          options: choices.concepts,
          hint: 'Concepts this one specializes, separated by commas',
        }),
        field('iri', 'IRI', 'text', { hint: 'Full IRI or prefix:local' }),
      ];
    case 'ontology-relationship':
      return [
        field('name', 'Name', 'text', { required: true }),
        field('target', 'Related concept', 'select', {
          at: ['roles', 0, 'concept'],
          options: choices.concepts,
          required: true,
        }),
        field('role', 'Role name', 'text', { at: ['roles', 0, 'name'] }),
        field('multiplicity', 'Multiplicity', 'select', {
          options: ['', 'ManyToOne', 'OneToOne'],
        }),
        field('verbalizes', 'Reading', 'list', {
          hint: 'For example {Customer} places {Order}; separate several with commas',
        }),
        field('description', 'Description', 'textarea'),
      ];
    case 'dataset':
      return [
        field('name', 'Name', 'text', { required: true }),
        field('source', 'Physical source', 'text', {
          required: true,
          hint: 'database.schema.table or a query',
        }),
        field('description', 'Description', 'textarea'),
        field('primary_key', 'Primary key', 'list', { hint: 'Columns, separated by commas' }),
      ];
    case 'field':
      return [
        field('name', 'Name', 'text', { required: true }),
        field('expression', 'Expression (ANSI SQL)', 'code', { at: ansi, required: true }),
        field('datatype', 'Data type', 'select', {
          options: ['', 'String', 'Integer', 'Decimal', 'Float', 'Boolean', 'Date', 'Time', 'DateTime', 'DateTimeTz', 'Opaque'],
        }),
        field('description', 'Description', 'textarea'),
      ];
    case 'join':
      return [
        field('name', 'Name', 'text', { required: true }),
        field('from', 'From dataset (many side)', 'select', {
          options: choices.datasets,
          required: true,
        }),
        field('from_columns', 'From columns', 'list', { required: true }),
        field('to', 'To dataset (one side)', 'select', {
          options: choices.datasets,
          required: true,
        }),
        field('to_columns', 'To columns', 'list', { required: true }),
      ];
    case 'metric':
      return [
        field('name', 'Name', 'text', { required: true }),
        ext('label', 'Label', 'text'),
        field('description', 'Description', 'textarea'),
        field('expression', 'Expression (ANSI SQL)', 'code', { at: ansi, required: true }),
        ext('type', 'Metric type', 'select', {
          options: ['', 'simple', 'ratio', 'derived', 'cumulative', 'filtered'],
        }),
        ext('numerator', 'Numerator', 'select', {
          options: choices.metrics,
          when: i => i?.type === 'ratio',
        }),
        ext('denominator', 'Denominator', 'select', {
          options: choices.metrics,
          when: i => i?.type === 'ratio',
        }),
        ext('inputs', 'Inputs', 'list', {
          options: choices.metrics,
          when: i => i?.type === 'derived' || i?.type === 'cumulative' || i?.type === 'filtered',
        }),
        ext('additivity', 'Additivity', 'select', {
          options: ['', 'additive', 'semi_additive', 'non_additive'],
        }),
        ext('unit', 'Unit', 'text'),
        ext('format', 'Format', 'text', { hint: 'For example 0.0% or #,##0' }),
        ext('time.dimension', 'Time dimension', 'text', {
          at: ['time', 'dimension'],
          hint: 'dataset.field',
        }),
        ext('time.min_grain', 'Minimum grain', 'select', {
          at: ['time', 'min_grain'],
          options: ['', ...GRAINS],
        }),
        ext('dimensions', 'Breakdowns', 'list', { hint: 'dataset.field, separated by commas' }),
        ext('owner', 'Owner', 'text'),
        ext('steward', 'Steward', 'text'),
        ext('status', 'Status', 'select', { options: [...STATUSES] }),
        ext('replaced_by', 'Replaced by', 'select', {
          options: ['', ...choices.metrics],
          when: i => i?.status === 'deprecated',
        }),
        ext('deprecation_reason', 'Deprecation reason', 'textarea', {
          when: i => i?.status === 'deprecated',
        }),
      ];
    case 'odcs-object':
      return [
        field('name', 'Name', 'text', { required: true }),
        field('physicalName', 'Physical name', 'text'),
        field('businessName', 'Business name', 'text'),
        field('physicalType', 'Physical type', 'text'),
        field('description', 'Description', 'textarea'),
      ];
    case 'odcs-property':
      return [
        field('name', 'Name', 'text', { required: true }),
        field('logicalType', 'Logical type', 'select', {
          options: ['', 'string', 'date', 'timestamp', 'time', 'number', 'integer', 'object', 'array', 'boolean'],
        }),
        field('physicalType', 'Physical type', 'text'),
        field('required', 'Required', 'boolean'),
        field('unique', 'Unique', 'boolean'),
        field('primaryKey', 'Primary key', 'boolean'),
        field('classification', 'Classification', 'text'),
        field('description', 'Description', 'textarea'),
      ];
    case 'odcs-foreign-key':
      return [field('to', 'References', 'text', { required: true, hint: 'object.property' }), field('type', 'Type', 'select', { options: ['foreignKey'] })];
    case 'concept-mapping':
      return [field('concept', 'Concept', 'select', { options: choices.concepts, required: true })];
  }
}
// Child lists shown in an item's editor, each opening its own item editor.
export const childLists: Partial<Record<ItemKind, { key: string; kind: ItemKind; label: string }[]>> = {
  concept: [{ key: 'relationships', kind: 'ontology-relationship', label: 'Relationships' }],
  dataset: [{ key: 'fields', kind: 'field', label: 'Fields' }],
  'odcs-object': [
    { key: 'properties', kind: 'odcs-property', label: 'Properties' },
    { key: 'relationships', kind: 'odcs-foreign-key', label: 'Foreign keys' },
  ],
  'odcs-property': [{ key: 'relationships', kind: 'odcs-foreign-key', label: 'Foreign keys' }],
};

/** Reads an item's workbench extension and its list position. */
export function extensionOf(item: any): { index: number; value: any } | null {
  const list = item?.custom_extensions;
  if (!Array.isArray(list)) return null;
  const index = list.findIndex((e: any) => e?.vendor_name === VENDOR);
  if (index < 0) return null;
  try {
    const value = JSON.parse(list[index].data);
    return isObject(value) ? { index, value } : null;
  } catch {
    return null;
  }
}
const getAt = (v: any, path: Path) => path.reduce((x, k) => x?.[k], v);
function setAt(current: any, path: Path, value: any): any {
  const [key, ...rest] = path;
  let base: any;
  if (Array.isArray(current)) {
    base = [...current];
  } else if (isObject(current)) {
    base = { ...current };
  } else if (typeof key === 'number') {
    base = [];
  } else {
    base = {};
  }
  const next = rest.length ? setAt(base[key as any], rest, value) : value;
  if (next === undefined && !Array.isArray(base)) delete base[key as any];
  else base[key as any] = next;
  // An object left empty by a removal disappears with it.
  if (rest.length && isObject(base[key as any]) && !Object.keys(base[key as any]).length) delete base[key as any];
  return base;
}
/** Reads a field from the item or its metric extension. */
export function readField(item: any, spec: FieldSpec) {
  return getAt(spec.extension ? extensionOf(item)?.value : item, spec.at);
}

/** Converts form input to a document value, omitting empty optional text. */
export function fieldValue(spec: FieldSpec, input: string | boolean): any {
  if (spec.input === 'boolean') return input ? true : undefined;
  const text = String(input);
  if (spec.input === 'list') {
    const items = text
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return items.length ? items : undefined;
  }
  return text === '' && !spec.required ? undefined : text;
}
/** Writes a field into an item or its extension. */
export function writeField(item: any, spec: FieldSpec, value: any) {
  if (!spec.extension) return setAt(item, spec.at, value);
  const ext = extensionOf(item);
  const data = setAt(ext?.value ?? { schema: 'semantic-workbench/metric/v1' }, spec.at, value);
  return writeExtension(item, data);
}
/** Updates the workbench extension while preserving other vendors' entries. */
export function writeExtension(item: any, data: any) {
  const ext = extensionOf(item);
  const text = JSON.stringify(data, null, 2) + '\n';
  const list = Array.isArray(item.custom_extensions) ? [...item.custom_extensions] : [];
  if (ext) list[ext.index] = { ...list[ext.index], data: text };
  else list.push({ vendor_name: VENDOR, data: text });
  return { ...item, custom_extensions: list };
}

const GOVERNANCE = new Set(['status', 'replaced_by', 'deprecation_reason', 'owner', 'steward', 'label']);
const definition = (item: any) => {
  const ext = extensionOf(item)?.value ?? {};
  return JSON.stringify([
    item?.expression,
    Object.fromEntries(
      Object.entries(ext)
        .filter(([k]) => !GOVERNANCE.has(k))
        .sort(),
    ),
  ]);
};
// An approved metric whose definition (expression or extension attributes other than governance)
// changes returns to proposed.
/** Reopens an approved metric when its definition changes beyond governance fields. */
export function applyStatusRules(before: any, after: any): { item: any; reopened: boolean } {
  const was = extensionOf(before)?.value?.status;
  const now = extensionOf(after)?.value;
  if (was !== 'approved' || now?.status !== 'approved' || definition(before) === definition(after)) return { item: after, reopened: false };
  return { item: writeExtension(after, { ...now, status: 'proposed' }), reopened: true };
}

/** Locates the list where a new item belongs, optionally under an owner. */
export function listPathFor(kind: ItemKind, document: any, owner?: Path, modelPrefix: Path = []): Path | null {
  switch (kind) {
    case 'concept':
      return Array.isArray(document?.ontology) ? ['ontology'] : null;
    case 'ontology-relationship':
      return owner ? [...owner, 'relationships'] : null;
    case 'dataset':
      return [...modelPrefix, 'datasets'];
    case 'field':
      return owner ? [...owner, 'fields'] : null;
    case 'join':
      return [...modelPrefix, 'relationships'];
    case 'metric':
      return [...modelPrefix, 'metrics'];
    case 'odcs-object':
      return document?.kind === 'DataContract' ? ['schema'] : null;
    case 'odcs-property':
      return owner ? [...owner, 'properties'] : null;
    case 'odcs-foreign-key':
      return owner ? [...owner, 'relationships'] : null;
    case 'concept-mapping':
      return Array.isArray(document?.concept_mappings) ? ['concept_mappings'] : null;
  }
}

/** Lists the item kinds supported by the document. */
export function addableKinds(document: any): ItemKind[] {
  if (!isObject(document)) return [];
  if (document.kind === 'DataContract') return ['odcs-object'];
  if (Array.isArray(document.concept_mappings)) return ['concept-mapping'];
  const out: ItemKind[] = [];
  if (Array.isArray(document.ontology)) out.push('concept');
  if (Array.isArray(document.datasets) || Array.isArray(document.semantic_model)) out.push('dataset', 'join', 'metric');
  return out;
}

/** Locates the first semantic model in a flat, legacy or consolidated document. */
export function semanticModelPrefix(document: any): Path | null {
  if (Array.isArray(document?.datasets)) return [];
  if (Array.isArray(document?.semantic_model)) return ['semantic_model', 0];
  const i = Array.isArray(document?.ontology_mappings) ? document.ontology_mappings.findIndex((m: any) => isObject(m?.semantic_model)) : -1;
  return i >= 0 ? ['ontology_mappings', i, 'semantic_model'] : null;
}

/**
 * Locates every semantic model of a document: a flat model, each model of a legacy list, or each
 * model embedded in a consolidated ontology's mappings. Mappings and data contracts hold none.
 */
export function semanticModelPaths(document: any): Path[] {
  if (!isObject(document) || isMapping(document) || document.kind === 'DataContract') return [];
  if (Array.isArray(document.ontology)) {
    const mappings = Array.isArray(document.ontology_mappings) ? document.ontology_mappings : [];
    return mappings.flatMap((mapping: any, index: number) => (isObject(mapping?.semantic_model) ? [['ontology_mappings', index, 'semantic_model']] : []));
  }
  if (Array.isArray(document.datasets)) return [[]];
  const models = Array.isArray(document.semantic_model) ? document.semantic_model : [];
  return models.flatMap((model: any, index: number) => (isObject(model) && Array.isArray(model.datasets) ? [['semantic_model', index]] : []));
}

/** Builds a new item with fields ordered like the format's examples. */
export function newItem(kind: ItemKind, values: Record<string, any>): any {
  const clean = (fieldValues: Record<string, any>) => Object.fromEntries(Object.entries(fieldValues).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
  switch (kind) {
    case 'concept':
      return clean({
        concept: values.concept,
        type: values.type || 'EntityType',
        description: values.description,
        extends: values.extends,
      });
    case 'ontology-relationship':
      return clean({
        name: values.name,
        roles: [clean({ concept: values.target, name: values.role })],
        multiplicity: values.multiplicity,
        verbalizes: values.verbalizes,
        description: values.description,
      });
    case 'dataset':
      return clean({
        name: values.name,
        source: values.source,
        description: values.description,
        primary_key: values.primary_key,
      });
    case 'field':
      return clean({
        name: values.name,
        expression: {
          dialects: [{ dialect: 'ANSI_SQL', expression: values.expression || values.name }],
        },
        datatype: values.datatype,
        description: values.description,
      });
    case 'join':
      return clean({
        name: values.name,
        from: values.from,
        to: values.to,
        from_columns: values.from_columns,
        to_columns: values.to_columns,
      });
    case 'metric':
      return clean({
        name: values.name,
        description: values.description,
        expression: { dialects: [{ dialect: 'ANSI_SQL', expression: values.expression }] },
      });
    case 'odcs-object':
      return clean({
        name: values.name,
        physicalName: values.physicalName,
        physicalType: values.physicalType || 'table',
        logicalType: 'object',
        description: values.description,
        properties: [clean({ name: values.property || 'id', logicalType: values.propertyType || 'string' })],
      });
    case 'odcs-property':
      return clean({
        name: values.name,
        logicalType: values.logicalType,
        physicalType: values.physicalType,
        required: values.required || undefined,
        unique: values.unique || undefined,
        primaryKey: values.primaryKey || undefined,
        description: values.description,
      });
    case 'odcs-foreign-key':
      return clean({ type: 'foreignKey', to: values.to });
    case 'concept-mapping':
      return clean({ concept: values.concept, object_mappings: [] });
  }
}
