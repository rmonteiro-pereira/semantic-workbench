/** Validates structured definitions against pinned schemas and semantic constraints. */
import { OSSIE_BUILTINS } from '../mappings/ossie-builtins';
import { isMapping, mappingSchemaIssues } from '../mappings/mapping-schema';
import { expandIri, prefixMap } from './iri';
import { odcsReferenceIssues } from '../odcs/foreign-keys';
import { contract, semantic } from '../generated/validators.js';
import { type Issue, rejectIssues, InputError } from './diagnostics';
import { metricLayerIssues, readKpiBindings } from '../metrics/extension';
const object = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: any) => typeof v === 'string' && !!v.trim();

// Kahn's algorithm is iterative and O(V + E), even for deep inheritance chains.
/** Detects inheritance cycles without recursion, including deep chains. */
export function inheritanceCycle(nodes: string[], parents: Map<string, string[]>) {
  const degree = new Map(nodes.map(n => [n, 0]));
  for (const list of parents.values())
    for (const p of list) if (degree.has(p)) degree.set(p, degree.get(p)! + 1);
  const queue = nodes.filter(n => degree.get(n) === 0);
  for (let i = 0; i < queue.length; i++)
    for (const p of parents.get(queue[i]) ?? [])
      if (degree.has(p)) {
        degree.set(p, degree.get(p)! - 1);
        if (!degree.get(p)) queue.push(p);
      }
  return nodes.filter(n => degree.get(n)! > 0);
}
/** Checks structured definitions against schemas and semantic rules. */
export function validateStructured(data: any, applyPinnedSchema = true): Issue[] {
  const issues: Issue[] = [];
  const fail = (path: string, message: string, code = 'structure') =>
    issues.push({ severity: 'error', code, path, message });
  const warn = (path: string, message: string, code = 'coverage') =>
    issues.push({ severity: 'warning', code, path, message });
  const obj = (v: any, p: string) => {
    if (!object(v)) {
      fail(p, 'Expected an object.');
      return false;
    }
    return true;
  };
  const str = (v: any, p: string) => {
    if (!text(v)) {
      fail(p, 'Expected a non-empty string.');
      return false;
    }
    return true;
  };
  const arr = (v: any, p: string, required = false): any[] => {
    if (v === undefined && !required) return [];
    if (!Array.isArray(v)) {
      fail(p, 'Expected an array.');
      return [];
    }
    if (required && !v.length) fail(p, 'At least one item is required.');
    return v;
  };
  const named = (items: any[], p: string, key = 'name') => {
    const names = new Set<string>();
    items.forEach((x, i) => {
      if (!obj(x, `${p}/${i}`)) return;
      if (str(x[key], `${p}/${i}/${key}`)) {
        if (names.has(x[key]))
          fail(`${p}/${i}/${key}`, `Duplicate ${key} "${x[key]}" in this scope.`, 'duplicate');
        names.add(x[key]);
      }
      if (x.description !== undefined && typeof x.description !== 'string')
        fail(`${p}/${i}/description`, 'Expected a string.');
    });
    return names;
  };
  const fields = (x: any, p: string, key: string) => {
    const xs = arr(x[key], `${p}/${key}`);
    const names = named(xs, `${p}/${key}`);
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
  const families = [
    data.kind === 'DataContract' || data.apiVersion !== undefined || data.schema !== undefined,
    data.ontology !== undefined,
    data.datasets !== undefined || data.semantic_model !== undefined,
    isMapping(data),
  ].filter(Boolean).length;
  if (families !== 1) {
    fail(
      '/',
      families > 1 &&
        (data.ontology !== undefined || isMapping(data)) &&
        (data.datasets !== undefined ||
          data.semantic_model !== undefined ||
          (data.ontology !== undefined && isMapping(data)))
        ? 'This file mixes Ossie layers in an unsupported single-file layout. Use one of the two official Ossie layouts: split files (an ontology, a semantic model and a standalone mapping, each in its own file), or the consolidated form (an ontology whose ontology_mappings embed the semantic model; deprecated upstream).'
        : 'Provide exactly one ODCS contract, Ossie ontology, mapping document, or Ossie semantic model.',
      'format',
    );
    rejectIssues(issues);
    return issues;
  }
  if (isMapping(data)) {
    issues.push(...mappingSchemaIssues(data));
    issues.push(...readKpiBindings(data, '').issues);
  } else if (
    data.kind === 'DataContract' ||
    data.apiVersion !== undefined ||
    data.schema !== undefined
  ) {
    if (data.kind !== 'DataContract') fail('/kind', 'ODCS kind must be DataContract.');
    for (const k of ['apiVersion', 'id', 'version']) str(data[k], '/' + k);
    if (data.apiVersion !== 'v3.1.0')
      warn(
        '/apiVersion',
        `No pinned schema for ${String(data.apiVersion)}; only structural checks apply.`,
      );
    const xs = arr(data.schema, '/schema', true);
    named(xs, '/schema');
    const stack = xs.filter(object).map((x, i) => ({ x, p: `/schema/${i}`, depth: 0 }));
    while (stack.length) {
      const { x, p, depth } = stack.pop()!;
      if (depth > 64) {
        fail(p, 'Nested properties exceed the supported depth of 64.');
        continue;
      }
      if (x.fields !== undefined) fields(x, p, 'fields');
      const children = arr(x.properties, p + '/properties');
      named(children, p + '/properties');
      children.forEach((child, i) => {
        if (object(child)) stack.push({ x: child, p: `${p}/properties/${i}`, depth: depth + 1 });
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
        const q = `/prefixes/${prefix.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        if (str(base, q) && !/^[a-z][a-z\d+.-]*:[^\s]+$/i.test(base as string))
          fail(q, `Prefix "${prefix}" must map to an absolute IRI.`);
      }
    const identifier = (value: unknown, q: string) => {
      if (!str(value, q)) return;
      const r = expandIri(value as string, prefixes);
      if ('error' in r) {
        fail(q, r.error);
        return;
      }
      return r.iri;
    };
    const legacyUri = (x: any, q: string) => {
      if (x.uri !== undefined && data.version !== '0.2.0.dev0')
        warn(
          q + '/uri',
          '"uri" is not an Ossie ontology field and is ignored. Global identifiers use "iri".',
        );
    };
    xs.forEach((x, i) => {
      if (!object(x)) return;
      const p = `/ontology/${i}`;
      if (x.type !== undefined) str(x.type, p + '/type');
      legacyUri(x, p);
      if (x.iri !== undefined) {
        const iri = identifier(x.iri, p + '/iri');
        if (iri) {
          if (iris.has(iri))
            fail(
              p + '/iri',
              `Duplicate concept IRI ${iri} (also on ${iris.get(iri)}).`,
              'duplicate',
            );
          else iris.set(iri, x.concept);
        }
      }
      for (const key of ['properties', 'fields']) if (x[key] !== undefined) fields(x, p, key);
      const ps = arr(x.extends, p + '/extends');
      parents.set(x.concept, ps.filter(text));
      ps.forEach((parent, j) => {
        if (str(parent, `${p}/extends/${j}`) && !names.has(parent) && !OSSIE_BUILTINS.has(parent))
          fail(`${p}/extends/${j}`, `Unknown parent concept "${parent}".`, 'reference');
      });
      const rs = arr(x.relationships, p + '/relationships');
      named(rs, p + '/relationships');
      rs.forEach((r, j) => {
        if (!object(r)) return;
        const q = `${p}/relationships/${j}`;
        legacyUri(r, q);
        if (r.iri !== undefined) identifier(r.iri, q + '/iri');
        arr(r.roles, q + '/roles', data.version !== '0.2.0.dev0').forEach((role, k) => {
          if (
            obj(role, `${q}/roles/${k}`) &&
            str(role.concept, `${q}/roles/${k}/concept`) &&
            !names.has(role.concept) &&
            !OSSIE_BUILTINS.has(role.concept)
          )
            fail(
              `${q}/roles/${k}/concept`,
              `Unknown concept "${role.concept}". Define it before importing.`,
              'reference',
            );
        });
        arr(r.verbalizes, q + '/verbalizes').forEach((v, k) => str(v, `${q}/verbalizes/${k}`));
      });
    });
    const cycle = inheritanceCycle([...names], parents);
    if (cycle.length)
      fail(
        '/ontology',
        `Cyclic inheritance detected near: ${cycle.slice(0, 8).join(', ')}. Remove an extends link to break the cycle.`,
        'inheritance-cycle',
      );
    if (data.version === '0.2.0.dev0') issues.push(...mappingSchemaIssues(data, 'ontology'));
    else
      warn(
        '/ontology',
        'Basic checks only. Use ontology version 0.2.0.dev0 for full schema checks.',
      );
    arr(data.ontology_mappings, '/ontology_mappings').forEach((m, i) => {
      const prefix = `/ontology_mappings/${i}`;
      const schemaIssues = mappingSchemaIssues(m, 'embedded', prefix);
      issues.push(...schemaIssues);
      if (!schemaIssues.length)
        try {
          issues.push(
            ...validateStructured(m.semantic_model, false).map(issue => ({
              ...issue,
              path: prefix + '/semantic_model' + issue.path,
            })),
          );
        } catch (e) {
          if (e instanceof InputError)
            issues.push(
              ...e.issues.map(issue => ({
                ...issue,
                path: prefix + '/semantic_model' + issue.path,
              })),
            );
          else throw e;
        }
    });
  } else {
    const models =
      data.semantic_model !== undefined
        ? arr(data.semantic_model, '/semantic_model', true)
        : [data];
    if (data.semantic_model !== undefined)
      warn(
        '/semantic_model',
        'Legacy multi-model wrapper checked structurally; the pinned Ossie schema describes one model per document.',
      );
    models.forEach((m, mi) => {
      const p = data.semantic_model !== undefined ? `/semantic_model/${mi}` : '';
      if (!obj(m, p || '/')) return;
      str(m.name, p + '/name');
      const ds = arr(m.datasets, p + '/datasets', true);
      const names = named(ds, p + '/datasets');
      const fieldNames = new Map<string, Set<string>>();
      ds.forEach((d, i) => {
        if (!object(d)) return;
        const q = `${p}/datasets/${i}`;
        str(d.source, q + '/source');
        fieldNames.set(d.name, fields(d, q, 'fields'));
        if (d.fields === undefined)
          warn(
            q + '/fields',
            'Fields are not declared; primary-key and join-field existence cannot be checked.',
          );
        arr(d.primary_key, q + '/primary_key').forEach((k, j) => {
          if (
            str(k, `${q}/primary_key/${j}`) &&
            d.fields !== undefined &&
            !fieldNames.get(d.name)!.has(k)
          )
            warn(
              `${q}/primary_key/${j}`,
              `Key column "${k}" is not exposed as a logical field. Its physical binding cannot be checked from this catalog.`,
              'coverage',
            );
        });
      });
      const rs = arr(m.relationships, p + '/relationships');
      named(rs, p + '/relationships');
      rs.forEach((r, i) => {
        if (!object(r)) return;
        const q = `${p}/relationships/${i}`;
        for (const key of ['from', 'to'])
          if (str(r[key], q + '/' + key) && !names.has(r[key]))
            fail(q + '/' + key, `unknown dataset "${r[key]}".`, 'reference');
        const from = arr(r.from_columns, q + '/from_columns', true);
        const to = arr(r.to_columns, q + '/to_columns', true);
        if (from.length !== to.length) fail(q, 'Join keys must have equal lengths.', 'join');
        for (const [side, keys] of [
          ['from', from],
          ['to', to],
        ] as const)
          keys.forEach((k, j) => {
            if (
              str(k, `${q}/${side}_columns/${j}`) &&
              names.has(r[side]) &&
              ds.find(d => d?.name === r[side])?.fields !== undefined &&
              !fieldNames.get(r[side])!.has(k)
            )
              fail(
                `${q}/${side}_columns/${j}`,
                `Unknown join field "${k}" on dataset "${r[side]}".`,
                'reference',
              );
          });
      });
      const ms = arr(m.metrics, p + '/metrics');
      const metricNames = named(ms, p + '/metrics');
      for (const n of metricNames)
        if (names.has(n))
          fail(p + '/metrics', `Metric "${n}" collides with a dataset name.`, 'duplicate');
      for (const [i, x] of [...ds, ...ms].entries())
        if (object(x)) {
          if (x.properties !== undefined) fields(x, p, 'properties');
          const q = i < ds.length ? `${p}/datasets/${i}` : `${p}/metrics/${i - ds.length}`;
          const expressions =
            i < ds.length
              ? arr(x.fields, q + '/fields')
                  .filter(object)
                  .map((f, j) => ({ value: f.expression, path: `${q}/fields/${j}/expression` }))
              : [{ value: x.expression, path: q + '/expression' }];
          for (const { value, path } of expressions)
            if (obj(value, path))
              arr(value.dialects, path + '/dialects', true).forEach((d, j) => {
                if (obj(d, `${path}/dialects/${j}`)) {
                  str(d.dialect, `${path}/dialects/${j}/dialect`);
                  str(d.expression, `${path}/dialects/${j}/expression`);
                }
              });
        }
      // Metrics-layer extensions and metric bindings on this model.
      issues.push(...metricLayerIssues(m, p, fieldNames), ...readKpiBindings(m, p, false).issues);
    });
    if (data.version !== '0.2.0.dev0')
      warn(
        '/version',
        `No pinned Ossie schema for ${String(data.version ?? 'unspecified version')}; only structural checks apply.`,
      );
  }
  const validator = !applyPinnedSchema
    ? null
    : data.kind === 'DataContract' && data.apiVersion === 'v3.1.0'
      ? contract
      : data.version === '0.2.0.dev0' && data.datasets !== undefined
        ? semantic
        : null;
  if (validator && !validator(data))
    for (const e of validator.errors ?? [])
      issues.push({
        severity: 'error',
        code: 'schema',
        path:
          (e.instancePath || '') +
            (e.keyword === 'required'
              ? '/' + e.params.missingProperty
              : e.keyword === 'additionalProperties'
                ? '/' + e.params.additionalProperty
                : '') || '/',
        message: e.message ?? 'Schema violation.',
      });
  rejectIssues(issues);
  return issues;
}
/** Validates a structured definition using the shared validation rules. */
export const validateKnownVersion = validateStructured;
