/** Inspects structured and RDF documents into entities, relationships and validation findings. */
import { OSSIE_BUILTINS, builtinConcept } from '../mappings/ossie-builtins';
import { isMapping } from '../mappings/mapping-schema';
import { expandIri, namespaceOf, prefixMap, type Namespace } from '../validation/iri';
import { locateInner } from '../metrics/extension';
import { datasetReferences } from '../metrics/deps';
import { odcsForeignKeys } from '../odcs/foreign-keys';
import { parseDocument } from 'yaml';
import { valuePatches } from '../edit/yaml-patch';
import { applyPatches } from '../editor/patch';
import { inspectRdf, rdfSyntax } from '../validation/rdf';
import { validateStructured, type ValidationOptions } from '../validation/validation';
import { InputError, validateEnvelope, type Issue } from '../validation/diagnostics';
/** Describes a model item displayed in the catalog and graph. */
export type Entity = {
  id: string;
  name: string;
  kind: string;
  path: (string | number)[];
  description: string;
  fields: string[];
  definition?: any;
  readOnlyForm?: boolean;
  declaredDomains?: string[];
  namespace?: Namespace;
};
/** Describes a directed, labeled link between model entities. */
export type Relationship = {
  id: string;
  source: string;
  target: string;
  label: string;
  data: { path: (string | number)[]; definition: any; kind: string; readOnlyForm?: boolean };
};
/** Parses a document into model entities, relationships and validation findings. */
export function inspect(source: string, filename = 'definition.yaml', options: ValidationOptions = {}) {
  validateEnvelope(source, filename);
  if (/\.(trig|nq|jsonld|ofn|omn)$/i.test(filename))
    throw new InputError([
      {
        severity: 'error',
        code: 'unsupported',
        path: '/',
        message: 'Unsupported serialization. Use YAML/JSON, Turtle, N-Triples, N3, or RDF/XML.',
      },
    ]);
  if (filename.toLowerCase().endsWith('.json'))
    try {
      JSON.parse(source);
    } catch (error) {
      throw new InputError([{ severity: 'error', code: 'json', path: '/', message: (error as Error).message }]);
    }
  const syntax = rdfSyntax(source, filename);
  if (syntax) return inspectRdf(source, filename, syntax);
  const doc = parseDocument(source, { uniqueKeys: true });
  if (doc.errors.length)
    throw new InputError(
      doc.errors.map(error => ({
        severity: 'error',
        code: 'syntax',
        path: '/',
        message: error.message,
        line: error.linePos?.[0].line,
        column: error.linePos?.[0].col,
      })),
    );
  if (doc.warnings.length)
    throw new InputError(
      doc.warnings.map(warning => ({
        severity: 'error',
        code: 'yaml-tag',
        path: '/',
        message: warning.message,
        line: warning.linePos?.[0].line,
        column: warning.linePos?.[0].col,
      })),
    );
  let data: any;
  try {
    data = doc.toJS({ maxAliasCount: 100 });
  } catch (error) {
    throw new InputError([{ severity: 'error', code: 'aliases', path: '/', message: (error as Error).message }]);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new InputError([
      {
        severity: 'error',
        code: 'structure',
        path: '/',
        message: 'Expected a YAML or JSON object.',
      },
    ]);
  // A "not validated" notice is about the whole file, so it carries no line and the editor lists it above the text.
  const locate = (items: Issue[]) =>
    items.map(issue => {
      if (issue.code === 'not-validated') return issue;
      const path = issue.path
        .split('/')
        .slice(1)
        .map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
      let node: any;
      while (path.length) {
        node = doc.getIn(path, true);
        if (node?.range) break;
        path.pop();
      }
      // Findings inside a SEMANTIC_WORKBENCH JSON block point at the offending key in that block.
      const offset = issue.innerPath && node?.range ? locateInner(source, node.range[0], node.range[1], issue.innerPath) : (node?.range?.[0] ?? 0);
      const before = source.slice(0, offset);
      return {
        ...issue,
        line: before.split('\n').length,
        column: offset - (before.lastIndexOf('\n') + 1) + 1,
      };
    });
  let issues: Issue[];
  try {
    issues = locate(validateStructured(data, true, options));
  } catch (error) {
    if (error instanceof InputError) throw new InputError(locate(error.issues));
    throw error;
  }
  const entities: Entity[] = [];
  const edges: Relationship[] = [];
  const add = (item: any, path: (string | number)[], kind: string) => {
    if (!item || typeof item !== 'object') throw Error(`${path.join('.')} must be an object`);
    const name = item.concept ?? item.name;
    if (typeof name !== 'string' || !name) throw Error(`${path.join('.')}: name is required`);
    const id = path.join('/');
    entities.push({
      id,
      definition: item,
      ...(data.kind === 'DataContract' && typeof data.domain === 'string' ? { declaredDomains: [data.domain] } : {}),
      name,
      kind,
      path,
      description: item.description ?? '',
      fields: (item.properties ?? item.fields ?? []).map((f: any) => f.name),
    });
    return id;
  };
  // Datasets, joins and metrics of one semantic model, at `prefix` inside the document. Metric
  // edges come from the syntax-aware reference scan (src/shared/metrics/deps.ts), not substring matches.
  const addSemanticModel = (semanticModel: any, prefix: (string | number)[], mi: number) => {
    if (!semanticModel.name || !Array.isArray(semanticModel.datasets) || !semanticModel.datasets.length) throw Error('Ossie model requires a name and non-empty datasets');
    semanticModel.datasets.forEach((x: any, i: number) => {
      if (!x.source) throw Error(`Dataset ${x.name}: source required`);
      add(x, [...prefix, 'datasets', i], 'Dataset');
    });
    const byName = new Map(entities.filter(e => e.kind === 'Dataset' && e.path.slice(0, prefix.length).join('/') === prefix.join('/')).map(e => [e.name, e]));
    for (const [ri, relationship] of (semanticModel.relationships ?? []).entries()) {
      const fromDataset = byName.get(relationship.from);
      const toDataset = byName.get(relationship.to);
      if (!fromDataset || !toDataset) throw Error(`Relationship ${relationship.name}: unknown dataset`);
      if (!relationship.from_columns?.length || relationship.from_columns.length !== relationship.to_columns?.length)
        throw Error(`Relationship ${relationship.name}: join keys must have equal lengths`);
      edges.push({
        id: `join-${mi}-${edges.length}`,
        source: fromDataset.id,
        target: toDataset.id,
        label: relationship.name,
        data: {
          path: [...prefix, 'relationships', ri],
          definition: relationship,
          kind: 'Dataset relationship',
        },
      });
    }
    const datasetNames = new Set(byName.keys());
    for (const [i, mx] of (semanticModel.metrics ?? []).entries()) {
      const metricId = add(mx, [...prefix, 'metrics', i], 'Metric');
      const used = new Set(
        (Array.isArray(mx.expression?.dialects) ? mx.expression.dialects : []).flatMap((d: any) => (typeof d?.expression === 'string' ? datasetReferences(d.expression, datasetNames) : [])),
      );
      for (const name of used as Set<string>) {
        const dataset = byName.get(name)!;
        edges.push({
          id: `metric-${mi}-${i}-${dataset.id}`,
          source: dataset.id,
          target: metricId,
          label: 'used by metric',
          data: {
            path: [...prefix, 'metrics', i],
            definition: mx,
            kind: 'Metric expression reference',
          },
        });
      }
    }
  };
  let kind: string;
  if (isMapping(data)) {
    kind = 'Ossie mappings';
    data.concept_mappings.forEach((m: any, i: number) => add(m, ['concept_mappings', i], 'Concept mapping'));
  } else if (data.kind === 'DataContract') {
    kind = 'ODCS';
    if (!data.apiVersion || !data.id || !data.version) throw Error('ODCS requires apiVersion, id and version');
    if (!Array.isArray(data.schema)) throw Error('ODCS requires a schema array');
    data.schema.forEach((x: any, i: number) => add(x, ['schema', i], 'Object'));
    for (const fk of odcsForeignKeys(data))
      edges.push({
        id: `fk-${edges.length}`,
        source: `schema/${fk.from}`,
        target: `schema/${fk.to}`,
        label: fk.label,
        data: { path: fk.path, definition: fk.definition, kind: 'Foreign key' },
      });
  } else if (Array.isArray(data.ontology)) {
    kind = 'Ossie ontology';
    data.ontology.forEach((x: any, i: number) => add(x, ['ontology', i], x.type ?? 'Concept'));
    const prefixes = prefixMap(data.prefixes);
    for (const entity of entities) {
      const iri = typeof entity.definition?.iri === 'string' ? expandIri(entity.definition.iri, prefixes) : null;
      if (iri && 'iri' in iri) entity.namespace = namespaceOf(iri.iri, prefixes);
    }
    const referenced = new Set<string>(
      data.ontology.flatMap((concept: any) => [...(concept.extends ?? []), ...(concept.relationships ?? []).flatMap((r: any) => (r.roles ?? []).map((role: any) => role.concept))]),
    );
    for (const name of referenced)
      if (OSSIE_BUILTINS.has(name) && !entities.some(e => e.name === name))
        entities.push({
          id: `builtin/${name}`,
          name,
          kind: 'Built-in concept',
          path: [],
          description: builtinConcept(name).description,
          fields: [],
          definition: builtinConcept(name),
          readOnlyForm: true,
        });
    const byName = new Map(entities.map(e => [e.name, e]));
    data.ontology.forEach((x: any, i: number) => {
      for (const [ri, relationship] of (x.relationships ?? []).entries())
        for (const role of relationship.roles ?? []) {
          const target = byName.get(role.concept);
          if (target)
            edges.push({
              id: `r-${i}-${edges.length}`,
              source: `ontology/${i}`,
              target: target.id,
              label: relationship.name,
              data: {
                path: ['ontology', i, 'relationships', ri],
                definition: relationship,
                kind: 'Ontology relationship',
              },
            });
        }
      for (const parent of x.extends ?? []) {
        const target = byName.get(parent);
        if (target)
          edges.push({
            id: `extends-${i}-${edges.length}`,
            source: `ontology/${i}`,
            target: target.id,
            label: 'extends',
            data: {
              path: ['ontology', i],
              definition: { name: 'extends', from: x.concept, to: parent },
              kind: 'Inheritance',
            },
          });
      }
    });
    // Consolidated layout: ontology_mappings embed a semantic model.
    (Array.isArray(data.ontology_mappings) ? data.ontology_mappings : []).forEach((om: any, i: number) => {
      if (om?.semantic_model && typeof om.semantic_model === 'object') addSemanticModel(om.semantic_model, ['ontology_mappings', i, 'semantic_model'], 100 + i);
    });
  } else {
    kind = 'Ossie semantic';
    const models = Array.isArray(data.semantic_model) ? data.semantic_model : [data];
    models.forEach((m: any, mi: number) => addSemanticModel(m, data.semantic_model ? ['semantic_model', mi] : [], mi));
  }
  let layout: string | undefined;
  if (kind === 'Ossie ontology' || kind === 'Ossie semantic' || kind === 'Ossie mappings') {
    if (Array.isArray(data.ontology_mappings) && data.ontology_mappings.length) {
      layout = 'embedded (deprecated)';
    } else {
      layout = 'split';
    }
  } else {
    layout = undefined;
  }
  return {
    kind,
    layout,
    name: data.name ?? data.semantic_model?.[0]?.name ?? 'Untitled',
    entities,
    edges,
    issues,
    document: data,
  };
}

/** Patches an entity description while preserving unrelated source text. */
export function editEntity(source: string, path: (string | number)[], description: string, filename = '') {
  return applyPatches(source, valuePatches(source, [...path, 'description'], description, filename));
}
