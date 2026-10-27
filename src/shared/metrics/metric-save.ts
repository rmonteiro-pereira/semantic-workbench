/** Plans metric and concept-binding writes across semantic models and mapping documents. */
import { validateInput } from '../validation/input';
import { rdfSyntax } from '../validation/rdf';
import { isMapping } from '../mappings/mapping-schema';
import { applyPatches } from '../editor/patch';
import { insertPatches, valuePatches, itemValue } from '../edit/yaml-patch';
import { extensionOf, semanticModelPrefix, writeExtension, type Path } from '../edit/item-model';
import {
  MAPPING_SCHEMA,
  METRIC_SCHEMA,
  VENDOR,
  readMetricExtension,
  readKpiBindings,
  type KpiBinding,
  type MetricExtension,
} from './extension';
// The metric and its extension belong in the semantic model. Concept bindings are sorted by metric
// name in the mapping root extension, or the embedded model root; a minimal mapping is planned if
// none exists.
/** Supplies a metric, its attributes and optional concept binding for a save plan. */
export type KpiRequest = {
  semanticPath: string;
  modelPath?: Path;
  existing?: boolean;
  metric: { name: string; expression: string; description?: string; datatype?: string };
  extension: MetricExtension;
  binding?: { measures: string; of?: string };
};
/** Names the request accepted by metric save planning. */
export type MetricRequest = KpiRequest;
/** Pairs a project path with original source text for save planning. */
export type ProjectFile = { path: string; source: string };
/** Lists source writes needed to save a metric and its concept binding. */
export type KpiPlan = { writes: { path: string; source: string; created: boolean }[] };
/** Explains why a requested metric save plan cannot be constructed. */
export class KpiError extends Error {}
/** Exports the metric save error under its descriptive alias. */
export { KpiError as MetricError };
/** Plans the source writes for a metric without writing files. */
export const planMetricSave = (files: ProjectFile[], req: KpiRequest) => planKpiSave(files, req);
const basename = (p: string) => p.split('/').pop()!;
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const parsed = (f: ProjectFile) => {
  if (rdfSyntax(f.source, basename(f.path))) return null;
  const v = validateInput(f.source, basename(f.path));
  return v.valid && 'document' in v.model ? v.model.document : null;
};

/** Serializes metric bindings one per line for readable source diffs. */
export const bindingsText = (bindings: KpiBinding[]) =>
  `{"schema": "${MAPPING_SCHEMA}", "kpi_bindings": [\n${bindings.map(b => '  ' + JSON.stringify(b)).join(',\n')}\n]}\n`;
/** Replaces or adds one metric binding and sorts bindings by metric name. */
export const sortedBindings = (list: KpiBinding[], next: KpiBinding) =>
  [...list, next].sort((a, b) => (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0));

/** Patches a binding into the selected root extension of YAML or JSON source. */
export function addBinding(
  source: string,
  owner: Path,
  binding: KpiBinding,
  filename = '',
): string {
  const root = itemValue(source, owner) ?? {};
  const list: any[] = Array.isArray(root.custom_extensions) ? root.custom_extensions : [];
  const index = list.findIndex(e => e?.vendor_name === VENDOR);
  if (index >= 0) {
    const current = readKpiBindings(root, '', true);
    if (current.issues.length)
      throw new KpiError(
        `The mapping's metric bindings need repair first: ${current.issues[0].message}`,
      );
    if (current.value.some(b => b.metric === binding.metric))
      throw new KpiError(`Metric "${binding.metric}" is already bound in this mapping.`);
    const data = JSON.parse(list[index].data);
    return applyPatches(
      source,
      valuePatches(
        source,
        [...owner, 'custom_extensions', index, 'data'],
        JSON.stringify({ ...data, kpi_bindings: sortedBindings(current.value, binding) }),
        filename,
      ),
    );
  }
  const entry = { vendor_name: VENDOR, data: bindingsText([binding]) };
  return applyPatches(
    source,
    list.length
      ? insertPatches(source, [...owner, 'custom_extensions'], entry, undefined, filename)
      : valuePatches(source, [...owner, 'custom_extensions'], [entry], filename),
  );
}
const stem = (path: string) =>
  basename(path)
    .replace(/\.(ya?ml|json)$/i, '')
    .replace(/\.(semantic_model|semantic|ossie)$/i, '');
/** Builds a minimal mapping document for the supplied model and metric binding. */
export function minimalMapping(
  name: string,
  ontology: { name: string; path: string },
  model: { name: string; path: string },
  binding: KpiBinding,
) {
  const data = bindingsText([binding])
    .split('\n')
    .filter(Boolean)
    .map(l => '      ' + l)
    .join('\n');
  const lines = [
    'version: 0.2.0.dev0',
    `name: ${JSON.stringify(name)}`,
    'ontology_ref:',
    `  name: ${JSON.stringify(ontology.name)}`,
    `  iri: ${JSON.stringify('./' + ontology.path)}`,
    'semantic_model_ref:',
    `  name: ${JSON.stringify(model.name)}`,
    `  iri: ${JSON.stringify('./' + model.path)}`,
    'concept_mappings: []',
    'custom_extensions:',
    `  - vendor_name: ${VENDOR}`,
    '    data: |',
    data,
  ];
  return lines.join('\n') + '\n';
}
/** Plans metric and binding source changes without applying the writes. */
export function planKpiSave(files: ProjectFile[], req: KpiRequest): KpiPlan {
  const name = req.metric?.name;
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new KpiError(
      'The metric name must start with a letter or underscore and use letters, digits and underscores.',
    );
  if (!req.existing && (typeof req.metric.expression !== 'string' || !req.metric.expression.trim()))
    throw new KpiError('The metric needs an expression.');
  const file = files.find(f => f.path === req.semanticPath);
  if (!file) throw new KpiError(`${req.semanticPath} is not a file of this project.`);
  const data = parsed(file);
  if (!object(data))
    throw new KpiError(`${req.semanticPath} is not a valid YAML or JSON definition.`);
  const prefix = req.modelPath ?? semanticModelPrefix(data);
  if (!prefix) throw new KpiError(`${req.semanticPath} has no semantic model.`);
  const model = prefix.reduce((v: any, k) => v?.[k], data);
  if (!object(model) || !Array.isArray(model.datasets))
    throw new KpiError(`No semantic model at /${prefix.join('/')}.`);
  const at = (model.metrics ?? []).findIndex((m: any) => m?.name === name);
  if (!req.existing && at >= 0)
    throw new KpiError(`A metric named ${name} already exists in ${model.name}.`);
  if (req.existing && at < 0)
    throw new KpiError(`There is no metric named ${name} in ${model.name}.`);
  if (req.existing && readMetricExtension(model.metrics[at]).value)
    throw new KpiError(`${name} already has attributes; edit them in the metric editor.`);
  // The extension: the pinned schema, inputs by name, no formula.
  const extension = { ...req.extension, schema: METRIC_SCHEMA };
  const checked = readMetricExtension({
    custom_extensions: [{ vendor_name: VENDOR, data: JSON.stringify(extension) }],
  });
  if (checked.issues.length) throw new KpiError(checked.issues.map(i => i.message).join(' '));
  const metric: any = {
    name,
    ...(req.metric.description ? { description: req.metric.description } : {}),
    ...(req.metric.datatype ? { datatype: req.metric.datatype } : {}),
    expression: {
      dialects: [{ dialect: 'ANSI_SQL', expression: String(req.metric.expression ?? '').trim() }],
    },
    custom_extensions: [{ vendor_name: VENDOR, data: JSON.stringify(extension, null, 2) + '\n' }],
  };
  const listPath = [...prefix, 'metrics'];
  let semantic: string;
  if (req.existing) {
    // Only the extension entry is added to the existing metric.
    const entry = metric.custom_extensions[0];
    const own = model.metrics[at].custom_extensions;
    const path = [...listPath, at, 'custom_extensions'];
    semantic = applyPatches(
      file.source,
      Array.isArray(own)
        ? insertPatches(file.source, path, entry, undefined, file.path)
        : valuePatches(file.source, path, [entry], file.path),
    );
  } else
    semantic = applyPatches(
      file.source,
      Array.isArray(model.metrics)
        ? insertPatches(file.source, listPath, metric, undefined, file.path)
        : valuePatches(file.source, listPath, [metric], file.path),
    );
  const writes: KpiPlan['writes'] = [];
  if (req.binding) {
    const binding: KpiBinding = {
      metric: name,
      measures: req.binding.measures,
      ...(req.binding.of ? { of: req.binding.of } : {}),
    };
    if (typeof binding.measures !== 'string' || !binding.measures.trim())
      throw new KpiError('Choose the concept the metric measures.');
    if (prefix[0] === 'ontology_mappings')
      semantic = addBinding(semantic, prefix, binding, file.path);
    else {
      // The mapping document that draws from this semantic model.
      const mappings = files.flatMap(f => {
        const d = f === file ? null : parsed(f);
        return d &&
          isMapping(d) &&
          (d.semantic_model_ref?.name === model.name ||
            stem(String(d.semantic_model_ref?.iri ?? '')) === stem(file.path))
          ? [{ f, d }]
          : [];
      });
      if (mappings.length > 1)
        throw new KpiError(
          `Several mapping documents draw from ${model.name}: ` +
            `${mappings.map(m => m.f.path).join(', ')}. Bind the metric in one of them by hand.`,
        );
      if (mappings.length)
        writes.push({
          path: mappings[0].f.path,
          source: addBinding(mappings[0].f.source, [], binding, mappings[0].f.path),
          created: false,
        });
      else {
        const ontologies = files.flatMap(f => {
          const d = parsed(f);
          return d && Array.isArray(d.ontology) && !(d.ontology_mappings ?? []).length
            ? [{ f, d }]
            : [];
        });
        if (!ontologies.length)
          throw new KpiError(
            'The project has no Ossie ontology to bind the metric to. Save it without concepts, or add the ontology first.',
          );
        const taken = new Set(files.map(f => f.path));
        let path = `${stem(file.path)}.mapping.yaml`;
        for (let n = 2; taken.has(path); n++) path = `${stem(file.path)}-${n}.mapping.yaml`;
        writes.push({
          path,
          source: minimalMapping(
            `${model.name} mappings`,
            { name: ontologies[0].d.name, path: ontologies[0].f.path },
            { name: model.name, path: file.path },
            binding,
          ),
          created: true,
        });
      }
    }
  }
  writes.unshift({ path: file.path, source: semantic, created: false });
  for (const w of writes) {
    const v = validateInput(w.source, basename(w.path));
    if (!v.valid)
      throw new KpiError(
        `${w.path} would not be valid: ${v.issues
          .filter(i => i.severity === 'error')
          .map(i => i.message)
          .join(' ')}`,
      );
  }
  return { writes };
}

/**
 * The file text with some workbench attributes of one metric changed, written the way the item
 * editor writes an attribute: only the changed values inside the attribute block are patched.
 */
export function withMetricAttributes(
  source: string,
  filename: string,
  metricPath: Path,
  changes: Record<string, unknown>,
): string {
  const metric = itemValue(source, metricPath);
  const extension = extensionOf(metric);
  if (!extension) throw new KpiError(`No workbench attributes at /${metricPath.join('/')}.`);
  const rewritten = writeExtension(metric, { ...extension.value, ...changes });
  const dataPath = [...metricPath, 'custom_extensions', extension.index, 'data'];
  const data = rewritten.custom_extensions[extension.index].data;
  return applyPatches(source, valuePatches(source, dataPath, data, filename));
}

/** Where a named metric sits in a semantic model of a file's text, or null when it is absent. */
export function metricPathIn(source: string, modelPath: Path, name: string): Path | null {
  const metrics = itemValue(source, [...modelPath, 'metrics']);
  if (!Array.isArray(metrics)) return null;
  const index = metrics.findIndex(metric => metric?.name === name);
  return index < 0 ? null : [...modelPath, 'metrics', index];
}
