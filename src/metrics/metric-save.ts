import { validateInput } from '../input';
import { rdfSyntax } from '../rdf';
import { isMapping } from '../mapping-schema';
import { applyPatches } from '../editor/patch';
import { insertPatches, valuePatches, itemValue } from '../edit/yaml-patch';
import { semanticModelPrefix, type Path } from '../edit/item-model';
import {
  MAPPING_SCHEMA,
  METRIC_SCHEMA,
  VENDOR,
  readMetricExtension,
  readKpiBindings,
  type KpiBinding,
  type MetricExtension,
} from './extension';
// A new metric from the wizard (FR-009, FR-010, research R12): the metric with its formula and its
// SEMANTIC_WORKBENCH extension go into the semantic model; the metric's concepts go, as one binding
// line in sorted position, into the root extension of the project's mapping document (created,
// minimal, when the project has none) or of the embedded semantic model in a consolidated file.
// The formula lives only in the metric's expression; the extension names inputs, never formulas.
// `existing` (v0.3.0, FR-017 Add attributes): the metric is already in the model without attributes;
// only its extension (and the binding) are added, its expression is left as it is.
export type KpiRequest = {
  semanticPath: string;
  modelPath?: Path;
  existing?: boolean;
  metric: { name: string; expression: string; description?: string; datatype?: string };
  extension: MetricExtension;
  binding?: { measures: string; of?: string };
};
export type MetricRequest = KpiRequest;
export type ProjectFile = { path: string; source: string };
export type KpiPlan = { writes: { path: string; source: string; created: boolean }[] };
export class KpiError extends Error {}
export { KpiError as MetricError };
export const planMetricSave = (files: ProjectFile[], req: KpiRequest) => planKpiSave(files, req);
const basename = (p: string) => p.split('/').pop()!;
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const parsed = (f: ProjectFile) => {
  if (rdfSyntax(f.source, basename(f.path))) return null;
  const v = validateInput(f.source, basename(f.path));
  return v.valid && 'document' in v.model ? v.model.document : null;
};
// One binding per line, sorted by metric name (research R12).
export const bindingsText = (bindings: KpiBinding[]) =>
  `{"schema": "${MAPPING_SCHEMA}", "kpi_bindings": [\n${bindings.map(b => '  ' + JSON.stringify(b)).join(',\n')}\n]}\n`;
export const sortedBindings = (list: KpiBinding[], next: KpiBinding) =>
  [...list, next].sort((a, b) => (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0));
// Add one binding to the root extension at `owner` of a YAML/JSON text.
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
export function minimalMapping(
  name: string,
  ontology: { name: string; path: string },
  model: { name: string; path: string },
  binding: KpiBinding,
) {
  return `version: 0.2.0.dev0\nname: ${JSON.stringify(name)}\nontology_ref:\n  name: ${JSON.stringify(ontology.name)}\n  iri: ${JSON.stringify('./' + ontology.path)}\nsemantic_model_ref:\n  name: ${JSON.stringify(model.name)}\n  iri: ${JSON.stringify('./' + model.path)}\nconcept_mappings: []\ncustom_extensions:\n  - vendor_name: ${VENDOR}\n    data: |\n${bindingsText(
    [binding],
  )
    .split('\n')
    .filter(Boolean)
    .map(l => '      ' + l)
    .join('\n')}\n`;
}
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
  // The extension: the pinned schema, inputs by name, no formula (FR-002, FR-003).
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
          `Several mapping documents draw from ${model.name}: ${mappings.map(m => m.f.path).join(', ')}. Bind the metric in one of them by hand.`,
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
