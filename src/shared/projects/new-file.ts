/** Builds the minimal valid file for each kind a person can start a project with, and names it. */
import { stringify } from 'yaml';
import { OSSIE_SCHEMA_VERSION } from '../validation/validation';
import { validateInput } from '../validation/input';

/** The kinds of definition file the New file dialog can create. */
export type NewFileKind = 'ontology' | 'semantic' | 'mapping' | 'odcs';

/** What the dialog shows for one kind, and the suffix its files carry in the shipped examples. */
export const NEW_FILE_KINDS: {
  kind: NewFileKind;
  label: string;
  description: string;
  suffix: string;
}[] = [
  {
    kind: 'ontology',
    label: 'Ossie ontology',
    description: 'Business concepts and their relationships.',
    suffix: '.ontology.yaml',
  },
  {
    kind: 'semantic',
    label: 'Ossie semantic model',
    description: 'Datasets, fields and metrics.',
    suffix: '.semantic.yaml',
  },
  {
    kind: 'mapping',
    label: 'Ossie mapping',
    description: 'Maps a semantic model onto an ontology.',
    suffix: '.mapping.yaml',
  },
  {
    kind: 'odcs',
    label: 'ODCS contract',
    description: 'An Open Data Contract Standard data contract.',
    suffix: '.odcs.yaml',
  },
];

/** A file of the project that a new mapping can point at. */
export type FileReference = { name: string; path: string };

/** The ontologies and semantic models of a project, by the name each one declares. */
export type MappingTargets = { ontologies: FileReference[]; semanticModels: FileReference[] };

/** The longest file name stem; keeps paths short enough for every file system. */
const MAX_STEM_LENGTH = 80;

/** Turns a display name into the stem of a file name, such as "Sales Orders" into "sales-orders". */
export function fileStem(name: string): string {
  const lowered = name.trim().toLowerCase();
  const dashed = lowered.replace(/[^a-z0-9]+/g, '-');
  return dashed.replace(/^-+|-+$/g, '').slice(0, MAX_STEM_LENGTH);
}

/** The file name for a kind and a display name, or an empty string when the name has no usable letters. */
export function newFileName(kind: NewFileKind, name: string): string {
  const stem = fileStem(name);
  if (!stem) return '';
  const suffix = NEW_FILE_KINDS.find(entry => entry.kind === kind)!.suffix;
  return stem + suffix;
}

/** Why a name cannot be used for a new file, or null when it can. Paths are compared without case. */
export function newFileProblem(kind: NewFileKind, name: string, existingPaths: string[]): string | null {
  if (!name.trim()) return 'Enter a name.';
  const fileName = newFileName(kind, name);
  if (!fileName) return 'The name needs at least one letter or digit.';
  const taken = existingPaths.some(path => path.toLowerCase() === fileName.toLowerCase());
  if (taken) return `${fileName} already exists in this project. Choose another name.`;
  return null;
}

/** Finds the ontologies and semantic models among a project's files, for a mapping to point at. */
export function mappingTargets(files: { path: string; source: string }[]): MappingTargets {
  const targets: MappingTargets = { ontologies: [], semanticModels: [] };
  for (const file of files) {
    const model = validateInput(file.source, file.path).model;
    const name = model && 'name' in model ? model.name : undefined;
    if (typeof name !== 'string' || !name.trim()) continue;
    if (model?.kind === 'Ossie ontology') targets.ontologies.push({ name, path: file.path });
    if (model?.kind === 'Ossie semantic') targets.semanticModels.push({ name, path: file.path });
  }
  return targets;
}

/** What a mapping needs that the project lacks, or null when both targets exist. */
export function mappingBlocker(targets: MappingTargets): string | null {
  if (targets.ontologies.length && targets.semanticModels.length) return null;
  if (!targets.ontologies.length && !targets.semanticModels.length) return 'A mapping needs an ontology and a semantic model in this project. Create them first.';
  if (!targets.ontologies.length) return 'A mapping needs an ontology in this project. Create one first.';
  return 'A mapping needs a semantic model in this project. Create one first.';
}

/** The pieces a new file is built from; only the ones its kind uses matter. */
export type NewFileOptions = {
  name: string;
  /** The identifier of a new contract, supplied so the template stays free of randomness. */
  contractId?: string;
  ontology?: FileReference;
  semanticModel?: FileReference;
};

const reference = (target: FileReference) => ({ name: target.name, iri: './' + target.path });

function templateFor(kind: NewFileKind, options: NewFileOptions): object {
  const name = options.name.trim();
  if (kind === 'ontology') {
    return {
      version: OSSIE_SCHEMA_VERSION,
      name,
      ontology: [{ concept: 'Thing', type: 'EntityType', description: 'Rename or replace this concept.' }],
    };
  }
  if (kind === 'semantic') {
    const idField = {
      name: 'id',
      expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'id' }] },
    };
    return {
      version: OSSIE_SCHEMA_VERSION,
      name,
      datasets: [{ name: 'dataset_1', source: 'schema.table_1', fields: [idField] }],
    };
  }
  if (kind === 'mapping') {
    if (!options.ontology || !options.semanticModel) throw new Error('A mapping needs an ontology and a semantic model.');
    return {
      version: OSSIE_SCHEMA_VERSION,
      name,
      ontology_ref: reference(options.ontology),
      semantic_model_ref: reference(options.semanticModel),
      concept_mappings: [],
    };
  }
  if (!options.contractId) throw new Error('A contract needs an identifier.');
  return {
    apiVersion: 'v3.1.0',
    kind: 'DataContract',
    id: options.contractId,
    name,
    version: '1.0.0',
    status: 'draft',
    schema: [{ name: 'table_1', properties: [{ name: 'id', logicalType: 'string' }] }],
  };
}

/** The YAML text of a new file of the given kind; it validates without findings. */
export function newFileSource(kind: NewFileKind, options: NewFileOptions): string {
  return stringify(templateFor(kind, options), { lineWidth: 0 });
}
