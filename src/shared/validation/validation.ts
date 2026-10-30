/** Validates structured definitions against pinned schemas and semantic constraints. */
import { OSSIE_BUILTINS } from '../mappings/ossie-builtins';
import { isMapping, mappingSchemaIssues } from '../mappings/mapping-schema';
import { expandIri, prefixMap } from './iri';
import { odcsReferenceIssues } from '../odcs/foreign-keys';
import { contract, semantic } from '../../generated/validators.js';
import { type Issue, rejectIssues, InputError, schemaErrorPath } from './diagnostics';
import { metricLayerIssues, readKpiBindings } from '../metrics/extension';
/** The one Ossie schema version this app ships validators for. */
export const OSSIE_SCHEMA_VERSION = '0.2.0.dev0';
const object = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: any) => typeof v === 'string' && !!v.trim();

// Kahn's algorithm is iterative and O(V + E), even for deep inheritance chains.
/** Detects inheritance cycles without recursion, including deep chains. */
export function inheritanceCycle(nodes: string[], parents: Map<string, string[]>) {
  const degree = new Map(nodes.map(n => [n, 0]));
  for (const list of parents.values()) for (const parent of list) if (degree.has(parent)) degree.set(parent, degree.get(parent)! + 1);
  const queue = nodes.filter(n => degree.get(n) === 0);
  for (let i = 0; i < queue.length; i++)
    for (const parent of parents.get(queue[i]) ?? [])
      if (degree.has(parent)) {
        degree.set(parent, degree.get(parent)! - 1);
        if (!degree.get(parent)) queue.push(parent);
      }
  return nodes.filter(n => degree.get(n)! > 0);
}
/** The code of the notice that says a file's declared version has no schema in this app. */
export const NOT_VALIDATED = 'not-validated';
/** Tells whether a finding is the notice that a file was not checked against a schema. */
export function isNotValidated(issue: Issue): boolean {
  return issue.code === NOT_VALIDATED;
}
/** Says that an Ossie file names a schema version the app cannot check, so its schema was not applied. */
function notValidatedIssue(version: unknown): Issue {
  const declared = version === undefined ? 'the file declares no version' : `the file says ${String(version)}`;
  const detail = `this app checks Ossie ${OSSIE_SCHEMA_VERSION}, ${declared}.`;
  return { severity: 'info', code: NOT_VALIDATED, path: '/version', message: `Not validated — ${detail}`, detail };
}
/** Tells whether parsed data is an Ossie ontology, semantic model or mapping rather than a data contract. */
function isOssieDocument(data: any) {
  const isContract = data.kind === 'DataContract' || data.apiVersion !== undefined || data.schema !== undefined;
  return !isContract && (data.ontology !== undefined || data.datasets !== undefined || data.semantic_model !== undefined || isMapping(data));
}
/** Options that change how a document is checked. */
export type ValidationOptions = {
  /** Check a file with an unknown Ossie version as if it declared the shipped version. */
  assumeOssieVersion?: boolean;
};
/** Checks structured definitions against schemas and semantic rules. */
export function validateStructured(data: any, applyPinnedSchema = true, options: ValidationOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const fail = (path: string, message: string, code = 'structure') => issues.push({ severity: 'error', code, path, message });
  const warn = (path: string, message: string, code = 'coverage') => issues.push({ severity: 'warning', code, path, message });
  const obj = (value: any, path: string) => {
    if (!object(value)) {
      fail(path, 'Expected an object.');
      return false;
    }
    return true;
  };
  const str = (value: any, path: string) => {
    if (!text(value)) {
      fail(path, 'Expected a non-empty string.');
      return false;
    }
    return true;
  };
  const arr = (value: any, path: string, required = false): any[] => {
    if (value === undefined && !required) return [];
    if (!Array.isArray(value)) {
      fail(path, 'Expected an array.');
      return [];
    }
    if (required && !value.length) fail(path, 'At least one item is required.');
    return value;
  };
  const named = (items: any[], path: string, key = 'name') => {
    const names = new Set<string>();
    items.forEach((x, i) => {
      if (!obj(x, `${path}/${i}`)) return;
      if (str(x[key], `${path}/${i}/${key}`)) {
        if (names.has(x[key])) fail(`${path}/${i}/${key}`, `Duplicate ${key} "${x[key]}" in this scope.`, 'duplicate');
        names.add(x[key]);
      }
      if (x.description !== undefined && typeof x.description !== 'string') fail(`${path}/${i}/description`, 'Expected a string.');
    });
    return names;
  };
  const fields = (x: any, path: string, key: string) => {
    const xs = arr(x[key], `${path}/${key}`);
    const names = named(xs, `${path}/${key}`);
    return names;
  };
  if (!obj(data, '/')) {
    rejectIssues(issues);
    return issues;
  }
  if (data.name !== undefined) str(data.name, '/name');
  // Cyclic YAML aliases and non-JSON scalar types cannot be persisted consistently.
  try {
    JSON.stringify(data);
  } catch {
    fail('/', 'Cyclic aliases or non-JSON scalar values are unsupported.', 'serialization');
    rejectIssues(issues);
  }
  // The notice goes last so the findings that block a save stay first.
  let notice: Issue | null = null;
  if (applyPinnedSchema && isOssieDocument(data) && data.version !== OSSIE_SCHEMA_VERSION) {
    if (options.assumeOssieVersion) {
      data = { ...data, version: OSSIE_SCHEMA_VERSION };
    } else {
      // Structure, references and cycles do not depend on the version, so they still run and broken
      // files are still refused. Only the pinned schema is skipped, and the notice says so.
      notice = notValidatedIssue(data.version);
      applyPinnedSchema = false;
    }
  }
  const families = [
    data.kind === 'DataContract' || data.apiVersion !== undefined || data.schema !== undefined,
    data.ontology !== undefined,
    data.datasets !== undefined || data.semantic_model !== undefined,
    isMapping(data),
  ].filter(Boolean).length;
  if (families !== 1) {
    fail(
      '/',
      families > 1 && (data.ontology !== undefined || isMapping(data)) && (data.datasets !== undefined || data.semantic_model !== undefined || (data.ontology !== undefined && isMapping(data)))
        ? 'This file mixes Ossie layers in an unsupported single-file layout. Use one of the two official Ossie layouts: split files (an ontology, a semantic model and a standalone mapping, each in its own file), or the consolidated form (an ontology whose ontology_mappings embed the semantic model; deprecated upstream).'
        : 'Provide exactly one ODCS contract, Ossie ontology, mapping document, or Ossie semantic model.',
      'format',
    );
    if (notice) issues.push(notice);
    rejectIssues(issues);
    return issues;
  }
  if (isMapping(data)) {
    issues.push(...mappingSchemaIssues(data));
    issues.push(...readKpiBindings(data, '').issues);
  } else if (data.kind === 'DataContract' || data.apiVersion !== undefined || data.schema !== undefined) {
    if (data.kind !== 'DataContract') fail('/kind', 'ODCS kind must be DataContract.');
    for (const key of ['apiVersion', 'id', 'version']) str(data[key], '/' + key);
    if (data.apiVersion !== 'v3.1.0') warn('/apiVersion', `No pinned schema for ${String(data.apiVersion)}; only structural checks apply.`);
    const xs = arr(data.schema, '/schema', true);
    named(xs, '/schema');
    const stack = xs.filter(object).map((x, i) => ({ x, p: `/schema/${i}`, depth: 0 }));
    while (stack.length) {
      const { x, p: path, depth } = stack.pop()!;
      if (depth > 64) {
        fail(path, 'Nested properties exceed the supported depth of 64.');
        continue;
      }
      if (x.fields !== undefined) fields(x, path, 'fields');
      const children = arr(x.properties, path + '/properties');
      named(children, path + '/properties');
      children.forEach((child, i) => {
        if (object(child)) stack.push({ x: child, p: `${path}/properties/${i}`, depth: depth + 1 });
      });
    }
    for (const issue of odcsReferenceIssues(data)) fail(issue.path, issue.message, 'reference');
  } else if (data.ontology !== undefined) {
    const xs = arr(data.ontology, '/ontology', true);
    const names = named(xs, '/ontology', 'concept');
    const parents = new Map<string, string[]>();
    const iris = new Map<string, string>();
    const prefixes = prefixMap(data.prefixes);
    if (data.prefixes !== undefined && obj(data.prefixes, '/prefixes'))
      for (const [prefix, base] of Object.entries(data.prefixes)) {
        const prefixPath = `/prefixes/${prefix.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        if (str(base, prefixPath) && !/^[a-z][a-z\d+.-]*:[^\s]+$/i.test(base as string)) fail(prefixPath, `Prefix "${prefix}" must map to an absolute IRI.`);
      }
    const identifier = (value: unknown, pointer: string) => {
      if (!str(value, pointer)) return;
      const iri = expandIri(value as string, prefixes);
      if ('error' in iri) {
        fail(pointer, iri.error);
        return;
      }
      return iri.iri;
    };
    xs.forEach((x, i) => {
      if (!object(x)) return;
      const path = `/ontology/${i}`;
      if (x.type !== undefined) str(x.type, path + '/type');
      if (x.iri !== undefined) {
        const iri = identifier(x.iri, path + '/iri');
        if (iri) {
          if (iris.has(iri)) fail(path + '/iri', `Duplicate concept IRI ${iri} (also on ${iris.get(iri)}).`, 'duplicate');
          else iris.set(iri, x.concept);
        }
      }
      for (const key of ['properties', 'fields']) if (x[key] !== undefined) fields(x, path, key);
      const ps = arr(x.extends, path + '/extends');
      parents.set(x.concept, ps.filter(text));
      ps.forEach((parent, j) => {
        if (str(parent, `${path}/extends/${j}`) && !names.has(parent) && !OSSIE_BUILTINS.has(parent)) fail(`${path}/extends/${j}`, `Unknown parent concept "${parent}".`, 'reference');
      });
      const rs = arr(x.relationships, path + '/relationships');
      named(rs, path + '/relationships');
      rs.forEach((relationship, j) => {
        if (!object(relationship)) return;
        const relationshipPath = `${path}/relationships/${j}`;
        if (relationship.iri !== undefined) identifier(relationship.iri, relationshipPath + '/iri');
        arr(relationship.roles, relationshipPath + '/roles').forEach((role, index) => {
          if (obj(role, `${relationshipPath}/roles/${index}`) && str(role.concept, `${relationshipPath}/roles/${index}/concept`) && !names.has(role.concept) && !OSSIE_BUILTINS.has(role.concept))
            fail(`${relationshipPath}/roles/${index}/concept`, `Unknown concept "${role.concept}". Define it before importing.`, 'reference');
        });
        arr(relationship.verbalizes, relationshipPath + '/verbalizes').forEach((v, k) => str(v, `${relationshipPath}/verbalizes/${k}`));
      });
    });
    const cycle = inheritanceCycle([...names], parents);
    if (cycle.length) fail('/ontology', `Cyclic inheritance detected near: ${cycle.slice(0, 8).join(', ')}. Remove an extends link to break the cycle.`, 'inheritance-cycle');
    if (applyPinnedSchema) issues.push(...mappingSchemaIssues(data, 'ontology'));
    arr(data.ontology_mappings, '/ontology_mappings').forEach((embeddedMapping, i) => {
      const prefix = `/ontology_mappings/${i}`;
      const schemaIssues = mappingSchemaIssues(embeddedMapping, 'embedded', prefix);
      issues.push(...schemaIssues);
      if (!schemaIssues.length)
        try {
          issues.push(
            ...validateStructured(embeddedMapping.semantic_model, false).map(issue => ({
              ...issue,
              path: prefix + '/semantic_model' + issue.path,
            })),
          );
        } catch (error) {
          if (error instanceof InputError)
            issues.push(
              ...error.issues.map(issue => ({
                ...issue,
                path: prefix + '/semantic_model' + issue.path,
              })),
            );
          else throw error;
        }
    });
  } else {
    const models = data.semantic_model !== undefined ? arr(data.semantic_model, '/semantic_model', true) : [data];
    if (data.semantic_model !== undefined) warn('/semantic_model', 'Legacy multi-model wrapper checked structurally; the pinned Ossie schema describes one model per document.');
    models.forEach((model, mi) => {
      const modelPath = data.semantic_model !== undefined ? `/semantic_model/${mi}` : '';
      if (!obj(model, modelPath || '/')) return;
      str(model.name, modelPath + '/name');
      const ds = arr(model.datasets, modelPath + '/datasets', true);
      const names = named(ds, modelPath + '/datasets');
      const fieldNames = new Map<string, Set<string>>();
      ds.forEach((dataset, i) => {
        if (!object(dataset)) return;
        const datasetPath = `${modelPath}/datasets/${i}`;
        str(dataset.source, datasetPath + '/source');
        fieldNames.set(dataset.name, fields(dataset, datasetPath, 'fields'));
        if (dataset.fields === undefined) warn(datasetPath + '/fields', 'Fields are not declared; primary-key and join-field existence cannot be checked.');
        arr(dataset.primary_key, datasetPath + '/primary_key').forEach((key, j) => {
          if (str(key, `${datasetPath}/primary_key/${j}`) && dataset.fields !== undefined && !fieldNames.get(dataset.name)!.has(key))
            warn(`${datasetPath}/primary_key/${j}`, `Key column "${key}" is not exposed as a logical field. Its physical binding cannot be checked from this catalog.`, 'coverage');
        });
      });
      const rs = arr(model.relationships, modelPath + '/relationships');
      named(rs, modelPath + '/relationships');
      rs.forEach((relationship, i) => {
        if (!object(relationship)) return;
        const relationshipPath = `${modelPath}/relationships/${i}`;
        for (const key of ['from', 'to'])
          if (str(relationship[key], relationshipPath + '/' + key) && !names.has(relationship[key])) fail(relationshipPath + '/' + key, `unknown dataset "${relationship[key]}".`, 'reference');
        const from = arr(relationship.from_columns, relationshipPath + '/from_columns', true);
        const to = arr(relationship.to_columns, relationshipPath + '/to_columns', true);
        if (from.length !== to.length) fail(relationshipPath, 'Join keys must have equal lengths.', 'join');
        for (const [side, keys] of [
          ['from', from],
          ['to', to],
        ] as const)
          keys.forEach((key, j) => {
            if (
              str(key, `${relationshipPath}/${side}_columns/${j}`) &&
              names.has(relationship[side]) &&
              ds.find(d => d?.name === relationship[side])?.fields !== undefined &&
              !fieldNames.get(relationship[side])!.has(key)
            )
              fail(`${relationshipPath}/${side}_columns/${j}`, `Unknown join field "${key}" on dataset "${relationship[side]}".`, 'reference');
          });
      });
      const ms = arr(model.metrics, modelPath + '/metrics');
      const metricNames = named(ms, modelPath + '/metrics');
      for (const metricName of metricNames) if (names.has(metricName)) fail(modelPath + '/metrics', `Metric "${metricName}" collides with a dataset name.`, 'duplicate');
      for (const [i, x] of [...ds, ...ms].entries())
        if (object(x)) {
          if (x.properties !== undefined) fields(x, modelPath, 'properties');
          const itemPath = i < ds.length ? `${modelPath}/datasets/${i}` : `${modelPath}/metrics/${i - ds.length}`;
          const expressions =
            i < ds.length
              ? arr(x.fields, itemPath + '/fields')
                  .filter(object)
                  .map((f, j) => ({ value: f.expression, path: `${itemPath}/fields/${j}/expression` }))
              : [{ value: x.expression, path: itemPath + '/expression' }];
          for (const { value, path } of expressions)
            if (obj(value, path))
              arr(value.dialects, path + '/dialects', true).forEach((dialectEntry, j) => {
                if (obj(dialectEntry, `${path}/dialects/${j}`)) {
                  str(dialectEntry.dialect, `${path}/dialects/${j}/dialect`);
                  str(dialectEntry.expression, `${path}/dialects/${j}/expression`);
                }
              });
        }
      // Metrics-layer extensions and metric bindings on this model.
      issues.push(...metricLayerIssues(model, modelPath, fieldNames), ...readKpiBindings(model, modelPath, false).issues);
    });
  }
  let validator: typeof contract | typeof semantic | null;
  if (!applyPinnedSchema) {
    validator = null;
  } else if (data.kind === 'DataContract' && data.apiVersion === 'v3.1.0') {
    validator = contract;
  } else if (data.version === '0.2.0.dev0' && data.datasets !== undefined) {
    validator = semantic;
  } else {
    validator = null;
  }
  if (validator && !validator(data))
    for (const error of validator.errors ?? [])
      issues.push({
        severity: 'error',
        code: 'schema',
        path: schemaErrorPath(error) || '/',
        message: error.message ?? 'Schema violation.',
      });
  if (notice) issues.push(notice);
  rejectIssues(issues);
  return issues;
}
/** Validates a structured definition using the shared validation rules. */
export const validateKnownVersion = validateStructured;
