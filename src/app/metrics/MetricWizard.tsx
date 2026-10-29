/** Validates metric creation step by step and previews the server's plan without executing SQL. */
import { WizardStepper } from '../projects/WizardStepper';
import { CompositionTree } from './Explanation';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { KpiExplanation, KpiSummary } from '../../server/agent/explain';
import { Modal } from '../projects/Modal';
import { api, StaleSave, type Doc, type KpiSaveRequest } from '../projects/api';
import { validateInput } from '../../shared/validation/input';
import { semanticModelPrefix, STATUSES, type Path } from '../../shared/edit/item-model';
import { GRAINS, VENDOR, readMetricExtension, type KpiType } from '../../shared/metrics/extension';
import { typeLabel } from './format';
import { expressionFor, extensionFor, list, type Draft } from './metric-draft';
import '../edit/edit.css';
import { SqlField } from '../editor/SqlField';
import { SqlCode } from '../sql/SqlCode';
import { OwnerInput } from './OwnerInput';
// Each step must validate before advancing; the server’s SQL preview is never executed. Save
// writes the metric and its extension to the model and its concept binding to the mapping.
function prefill(kpiSummary: KpiSummary): Partial<Draft> {
  const agg = aggregationOf(kpiSummary.expression);
  return {
    file: kpiSummary.file,
    name: kpiSummary.name,
    label: kpiSummary.label,
    description: kpiSummary.description ?? '',
    type: kpiSummary.type,
    expression: kpiSummary.expression ?? '',
    inputs: kpiSummary.inputs.join(', '),
    ...(kpiSummary.type === 'ratio' ? { numerator: kpiSummary.inputs[0] ?? '', denominator: kpiSummary.inputs[1] ?? '' } : {}),
    ...(agg ? { aggregation: agg.aggregation, field: agg.field } : {}),
    measures: kpiSummary.concepts.find(c => c.role === 'measures')?.concept ?? '',
    of: kpiSummary.concepts.find(c => c.role === 'of')?.concept ?? '',
    unit: kpiSummary.unit ?? '',
    format: kpiSummary.format ?? '',
  };
}
const STEPS = ['Concept', 'Data', 'Type and inputs', 'Time and breakdowns', 'Targets', 'Governance', 'Explanation and SQL', 'Save'] as const;
/** What the wizard's dropdown helper needs: the chosen value, its change handler, the option list and the accessible label. */
type SelectProps = { value: string; onChange: (value: string) => void; options: React.ReactNode; aria: string; empty?: string };

type Model = {
  file: string;
  path: Path;
  name: string;
  datasets: { name: string; fields: string[] }[];
  metrics: string[];
};
const AGGREGATIONS = ['SUM', 'COUNT', 'COUNT DISTINCT', 'AVG', 'MIN', 'MAX'];
const snake = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, '_$1');
function modelsOf(docs: Doc[]): Model[] {
  return docs.flatMap(projectDoc => {
    const input = validateInput(projectDoc.source, projectDoc.filename);
    if (!input.valid || !('document' in input.model)) return [];
    const doc = input.model.document;
    const prefix = semanticModelPrefix(doc);
    if (!prefix) return [];
    const semanticModel = prefix.reduce((x: any, k) => x?.[k], doc);
    if (!semanticModel || !Array.isArray(semanticModel.datasets)) return [];
    return [
      {
        file: projectDoc.path,
        path: prefix,
        name: String(semanticModel.name ?? projectDoc.path),
        datasets: semanticModel.datasets.map((ds: any) => ({
          name: ds.name,
          fields: (ds.fields ?? []).map((f: any) => f.name),
        })),
        metrics: (semanticModel.metrics ?? []).map((x: any) => x.name),
      },
    ];
  });
}
const conceptsOf = (docs: Doc[]) =>
  [
    ...new Set(
      docs.flatMap(doc => {
        const input = validateInput(doc.source, doc.filename);
        return input.valid && 'document' in input.model && Array.isArray(input.model.document.ontology) ? input.model.document.ontology.map((c: any) => c?.concept).filter(Boolean) : [];
      }),
    ),
  ].sort() as string[];
// An existing metric keeps its name and expression. Only workbench attributes and a missing
// concept binding are added.
const aggregationOf = (expression = '') => {
  const match = /^\s*(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?([^()]+?)\s*\)\s*$/i.exec(expression);
  return match
    ? {
        aggregation: match[1].toUpperCase() === 'COUNT' && match[2] ? 'COUNT DISTINCT' : match[1].toUpperCase(),
        field: match[3],
      }
    : null;
};
/** Collects and validates a metric definition or adds attributes to an existing metric. */
export function MetricWizard({
  project,
  docs,
  kpis,
  onClose,
  onSaved,
  existing,
}: {
  project: string;
  docs: Doc[];
  kpis: KpiSummary[];
  onClose: () => void;
  onSaved: (file: string, modelPath: Path, name: string) => void;
  existing?: KpiSummary;
}) {
  const models = useMemo(() => modelsOf(docs), []);
  const concepts = useMemo(() => conceptsOf(docs), []);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    measures: '',
    of: '',
    file: models[0]?.file ?? '',
    name: '',
    label: '',
    description: '',
    type: 'ratio',
    aggregation: 'SUM',
    field: '',
    numerator: '',
    denominator: '',
    inputs: '',
    expression: '',
    window: 'to_date',
    windowLength: '',
    windowGrain: '',
    filterField: '',
    filterOperator: 'equals',
    filterValue: '',
    additivity: '',
    timeDimension: '',
    minGrain: 'month',
    grains: ['month', 'quarter', 'year'],
    dimensions: [],
    direction: '',
    target: '',
    targetGrain: 'month',
    warning: '',
    critical: '',
    owner: '',
    steward: '',
    status: 'proposed',
    unit: '',
    format: '',
    ...(existing ? prefill(existing) : {}),
  });
  const set = (patch: Partial<Draft>) => {
    setDraft(x => ({ ...x, ...patch }));
    setPreview(null);
  };
  const model = models.find(m => m.file === draft.file);
  const fields = model?.datasets.flatMap(ds => ds.fields.map(f => `${ds.name}.${f}`)) ?? [];
  const labelOf = (name: string) => kpis.find(k => k.name === name && k.file === draft.file)?.label;
  const metricOption = (name: string) => (
    <option key={name} value={name}>
      {labelOf(name) ? `${labelOf(name)} (${name})` : name}
    </option>
  );
  // An existing metric keeps its expression; one already bound to concepts keeps its binding.
  const bound = !!existing?.concepts.length;
  const expression = existing ? (existing.expression ?? '') : expressionFor(draft);
  const extension = extensionFor(draft);
  const request: KpiSaveRequest = {
    semanticPath: draft.file,
    modelPath: existing ? existing.modelPath : model?.path,
    ...(existing ? { existing: true } : {}),
    metric: {
      name: draft.name,
      expression,
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    },
    extension,
    ...(draft.measures && !bound ? { binding: { measures: draft.measures, ...(draft.of ? { of: draft.of } : {}) } } : {}),
  };
  // What blocks each step.
  const problems = (i: number): string[] => {
    const out: string[] = [];
    if (i === 1 && !model) out.push('Choose the semantic model that holds the data.');
    if (i === 2) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(draft.name)) out.push('Give the metric a name of letters, digits and underscores.');
      else if (!existing && model?.metrics.includes(draft.name)) out.push(`${draft.name} already exists in ${model.name}.`);
      if (!draft.label.trim()) out.push('Give the metric a label people will read.');
    }
    if (i === 2 && !existing) {
      if (draft.type === 'simple' && !draft.field) out.push('Choose the field to aggregate.');
      if (draft.type === 'ratio' && (!draft.numerator || !draft.denominator)) out.push('Choose the numerator and the denominator.');
      if (draft.type === 'ratio' && draft.numerator && draft.numerator === draft.denominator) out.push('Numerator and denominator must differ.');
      if (['derived', 'cumulative', 'filtered'].includes(draft.type) && !list(draft.inputs).length) out.push('Choose the input metrics.');
      if (['derived', 'cumulative', 'filtered'].includes(draft.type) && !expression) out.push('Write the expression over the input metrics.');
      if (draft.type === 'filtered' && !draft.filterField) out.push('Choose the filter field.');
    }
    if (i === 3 && draft.timeDimension && !/^[^.\s]+\.[^.\s]+$/.test(draft.timeDimension)) out.push('The time dimension is a dataset.field.');
    if (i === 3 && draft.minGrain && draft.grains.length && !draft.grains.includes(draft.minGrain)) out.push('The allowed grains must include the minimum grain.');
    if (i === 4 && draft.direction && (draft.target.trim() === '' || Number.isNaN(Number(draft.target)))) out.push('The target is a number.');
    if (i === 4 && [draft.warning, draft.critical].some(v => v.trim() !== '' && Number.isNaN(Number(v)))) out.push('Thresholds are numbers.');
    if (i === 5 && !draft.owner.trim()) out.push('Name the owner who answers for this metric.');
    if (i >= 2 && i <= 5) {
      const checked = readMetricExtension({
        custom_extensions: [
          {
            vendor_name: VENDOR,
            data: JSON.stringify({ schema: 'semantic-workbench/metric/v1', ...extension }),
          },
        ],
      });
      if (i === 5) out.push(...checked.issues.map(x => x.message));
    }
    return out;
  };
  const blocking = problems(step);
  const [preview, setPreview] = useState<{
    changes: { path: string; created: boolean; added: string[]; removed: string[] }[];
    explanation: KpiExplanation;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (step !== 6 || preview) return;
    setBusy(true);
    setError('');
    api
      .previewKpi(project, request)
      .then(p => {
        setPreview(p);
        setBusy(false);
      })
      .catch(e => {
        setError(e.message);
        setBusy(false);
      });
  }, [step]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const baseHashes = Object.fromEntries(docs.map(x => [x.path, x.hash]));
      await api.saveKpi(project, { ...request, baseHashes });
      onSaved(draft.file, model!.path, draft.name);
    } catch (error) {
      setError(error instanceof StaleSave ? 'Not saved: a file of the project changed meanwhile. Close the wizard and start again.' : (error as Error).message);
      setBusy(false);
    }
  }
  const go = (i: number) => {
    setStep(i);
    setDone(x => Math.max(x, i));
  };
  const field = (label: string, control: React.ReactNode, hint?: string, wide = false) => (
    <label className={wide ? 'wide' : ''}>
      <span>{label}</span>
      {control}
      {hint && <small>{hint}</small>}
    </label>
  );
  const select = ({ value, onChange, options, aria, empty = '—' }: SelectProps) => (
    <select aria-label={aria} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {options}
    </select>
  );
  const toggledValues = (values: string[], option: string, checked: boolean) => (checked ? [...values, option] : values.filter(x => x !== option));
  const multi = (values: string[], options: string[], onChange: (selected: string[]) => void, aria: string) => (
    <div className="wizard-checks" role="group" aria-label={aria}>
      {options.map(option => (
        <label key={option} className="item-check">
          <input type="checkbox" checked={values.includes(option)} onChange={e => onChange(toggledValues(values, option, e.target.checked))} />
          {option}
        </label>
      ))}
    </div>
  );
  const footer = (
    <>
      <button type="button" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
        Back
      </button>
      <span className="dialog-footer-spacer" />
      <button type="button" onClick={onClose} disabled={busy && step === 7}>
        Cancel
      </button>
      {step < 7 ? (
        <button type="button" className="primary" onClick={() => go(step + 1)} disabled={blocking.length > 0 || (step === 6 && !preview)}>
          Next
        </button>
      ) : (
        <button type="button" className="primary" onClick={save} disabled={busy || !preview}>
          {busy ? 'Saving' : 'Save to file'}
        </button>
      )}
    </>
  );
  return (
    <Modal
      title={existing ? `Add attributes to ${existing.label}` : 'New metric'}
      onCancel={onClose}
      className="item-editor kpi-wizard"
      footer={footer}
      footerNote={step < 7 ? blocking[0] : undefined}
    >
      <section className="wizard-body" aria-label={STEPS[step]}>
        <WizardStepper steps={STEPS} current={step} reachable={done} onGo={setStep} />
        <div className="wizard-step">
          {step === 0 && bound && (
            <p>
              {existing!.label} is already bound: it measures <strong>{draft.measures || '—'}</strong>
              {draft.of && (
                <>
                  {' '}
                  of <strong>{draft.of}</strong>
                </>
              )}
              . The binding stays as it is.
            </p>
          )}
          {step === 0 && !bound && (
            <>
              <p>Which business concept does this metric measure, and what is it about? The binding is stored in the project's mapping document.</p>
              <div className="item-fields">
                {field(
                  'Business concept',
                  <input list="kpi-concepts" aria-label="Concept measured" value={draft.measures} onChange={e => set({ measures: e.target.value })} placeholder="Concept name" />,
                  'The concept this metric measures. Leave empty to save the metric without one.',
                )}
                {field(
                  'Computed per',
                  <input list="kpi-concepts" aria-label="Concept it is about" value={draft.of} onChange={e => set({ of: e.target.value })} placeholder="Entity name" />,
                  'Optional. The entity the value is computed for, such as Property.',
                )}
                <datalist id="kpi-concepts">
                  {concepts.map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {draft.measures && !concepts.includes(draft.measures) && (
                  <p className="item-note wide">
                    <AlertTriangle size={13} />
                    {draft.measures} is not a concept of the project's ontology; the metric will show a finding until it exists.
                  </p>
                )}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <p>The semantic model whose datasets and metrics this metric reads.</p>
              <div className="item-fields">
                {existing ? (
                  <p className="wide">
                    {existing.model} ({existing.file})
                  </p>
                ) : (
                  field(
                    'Semantic model',
                    select({
                      value: draft.file,
                      onChange: v => set({ file: v, field: '', numerator: '', denominator: '', inputs: '' }),
                      options: models.map(modelOption => (
                        <option key={modelOption.file + modelOption.path.join('/')} value={modelOption.file}>
                          {modelOption.name} ({modelOption.file})
                        </option>
                      )),
                      aria: 'Semantic model',
                      empty: 'Choose',
                    }),
                    undefined,
                    true,
                  )
                )}
                {model && (
                  <p className="wide">
                    {model.datasets.length} datasets · {model.metrics.length} metrics: {model.datasets.map(x => x.name).join(', ')}
                  </p>
                )}
              </div>
            </>
          )}
          {step === 2 && existing && (
            <div className="item-fields">
              {field('Label', <input aria-label="Label" value={draft.label} onChange={e => set({ label: e.target.value })} />)}
              {field('Name', <input aria-label="Name" value={draft.name} readOnly />, 'As written in the semantic model')}
              {field(
                'Type',
                select({
                  value: draft.type,
                  onChange: v => set({ type: (v || 'simple') as KpiType }),
                  options: (['simple', 'ratio', 'derived', 'cumulative', 'filtered'] as KpiType[]).map(kpiType => (
                    <option key={kpiType} value={kpiType}>
                      {typeLabel[kpiType]}
                    </option>
                  )),
                  aria: 'Metric type',
                }),
                existing.typeDeclared ? undefined : 'Read from the expression',
              )}
              {draft.type === 'ratio' && (
                <>
                  {field('Numerator', select({ value: draft.numerator, onChange: v => set({ numerator: v }), options: model?.metrics.map(metricOption), aria: 'Numerator', empty: 'Choose' }))}
                  {field('Denominator', select({ value: draft.denominator, onChange: v => set({ denominator: v }), options: model?.metrics.map(metricOption), aria: 'Denominator', empty: 'Choose' }))}
                </>
              )}
              {['derived', 'cumulative', 'filtered'].includes(draft.type) &&
                field('Input metrics', <input aria-label="Input metrics" value={draft.inputs} onChange={e => set({ inputs: e.target.value })} />, 'Metric names, separated by commas')}
              {field(
                'Additivity',
                select({
                  value: draft.additivity,
                  onChange: v => set({ additivity: v }),
                  options: ['additive', 'semi_additive', 'non_additive'].map(a => <option key={a}>{a}</option>),
                  aria: 'Additivity',
                  empty: 'From the type',
                }),
              )}
              <p className="wide formula-line">
                Expression (kept as written): <code>{expression || '—'}</code>
              </p>
            </div>
          )}
          {step === 2 && !existing && (
            <div className="item-fields">
              {field(
                'Label',
                <input
                  aria-label="Label"
                  value={draft.label}
                  onChange={event =>
                    set({
                      label: event.target.value,
                      ...(draft.name === snake(draft.label) || !draft.name ? { name: snake(event.target.value) } : {}),
                    })
                  }
                  placeholder="Vacancy rate"
                />,
              )}
              {field('Name', <input aria-label="Name" value={draft.name} onChange={e => set({ name: e.target.value })} />, 'The metric name in the semantic model')}
              {field(
                'Type',
                select({
                  value: draft.type,
                  onChange: v => set({ type: (v || 'simple') as KpiType }),
                  options: (['simple', 'ratio', 'derived', 'cumulative', 'filtered'] as KpiType[]).map(kpiType => (
                    <option key={kpiType} value={kpiType}>
                      {typeLabel[kpiType]}
                    </option>
                  )),
                  aria: 'Metric type',
                }),
              )}
              {draft.type === 'simple' && (
                <>
                  {field(
                    'Aggregation',
                    select({ value: draft.aggregation, onChange: v => set({ aggregation: v || 'SUM' }), options: AGGREGATIONS.map(a => <option key={a}>{a}</option>), aria: 'Aggregation' }),
                  )}
                  {field(
                    'Field',
                    select({ value: draft.field, onChange: v => set({ field: v }), options: fields.map(f => <option key={f}>{f}</option>), aria: 'Field to aggregate', empty: 'Choose' }),
                  )}
                </>
              )}
              {draft.type === 'ratio' && (
                <>
                  {field('Numerator', select({ value: draft.numerator, onChange: v => set({ numerator: v }), options: model?.metrics.map(metricOption), aria: 'Numerator', empty: 'Choose' }))}
                  {field(
                    'Denominator',
                    select({ value: draft.denominator, onChange: v => set({ denominator: v }), options: model?.metrics.map(metricOption), aria: 'Denominator', empty: 'Choose' }),
                    'Division by zero gives no value (NULLIF)',
                  )}
                </>
              )}
              {['derived', 'cumulative', 'filtered'].includes(draft.type) && (
                <>
                  {field(
                    'Input metrics',
                    <input
                      aria-label="Input metrics"
                      list="kpi-metrics"
                      value={draft.inputs}
                      onChange={event =>
                        set({
                          inputs: event.target.value,
                          ...(!draft.expression && draft.type !== 'derived' ? { expression: list(event.target.value)[0] ?? '' } : {}),
                        })
                      }
                    />,
                    'Metric names, separated by commas',
                  )}
                  <datalist id="kpi-metrics">
                    {model?.metrics.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  {field(
                    'Expression',
                    <SqlField ariaLabel="Expression" dialect="ANSI_SQL" rows={2} value={draft.expression} onChange={v => set({ expression: v })} />,
                    'ANSI SQL over the input metrics; warnings never block',
                    true,
                  )}
                </>
              )}
              {draft.type === 'cumulative' && (
                <>
                  {field('Window', select({ value: draft.window, onChange: v => set({ window: v }), options: ['to_date', 'rolling', 'all'].map(w => <option key={w}>{w}</option>), aria: 'Window' }))}
                  {field('Window grain', select({ value: draft.windowGrain, onChange: v => set({ windowGrain: v }), options: GRAINS.map(g => <option key={g}>{g}</option>), aria: 'Window grain' }))}
                  {draft.window === 'rolling' && field('Length', <input aria-label="Window length" value={draft.windowLength} onChange={e => set({ windowLength: e.target.value })} />)}
                </>
              )}
              {draft.type === 'filtered' && (
                <>
                  {field('Filter field', select({ value: draft.filterField, onChange: v => set({ filterField: v }), options: fields.map(f => <option key={f}>{f}</option>), aria: 'Filter field' }))}
                  {field(
                    'Operator',
                    select({
                      value: draft.filterOperator,
                      onChange: v => set({ filterOperator: v }),
                      options: ['equals', 'not_equals', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'is_null', 'is_not_null'].map(o => <option key={o}>{o}</option>),
                      aria: 'Filter operator',
                    }),
                  )}
                  {field('Value', <input aria-label="Filter value" value={draft.filterValue} onChange={e => set({ filterValue: e.target.value })} />)}
                </>
              )}
              {field(
                'Additivity',
                select({
                  value: draft.additivity,
                  onChange: v => set({ additivity: v }),
                  options: ['additive', 'semi_additive', 'non_additive'].map(a => <option key={a}>{a}</option>),
                  aria: 'Additivity',
                  empty: 'From the type',
                }),
                draft.type === 'ratio' ? 'A ratio is never summed across groups' : undefined,
              )}
              {field('Description', <textarea aria-label="Description" rows={2} value={draft.description} onChange={e => set({ description: e.target.value })} />, undefined, true)}
              <p className="wide formula-line">
                Expression: <code>{expression || '—'}</code>
              </p>
            </div>
          )}
          {step === 3 && (
            <div className="item-fields">
              {field(
                'Time dimension',
                select({ value: draft.timeDimension, onChange: v => set({ timeDimension: v }), options: fields.map(f => <option key={f}>{f}</option>), aria: 'Time dimension', empty: 'None' }),
                'The date field the metric is reported over',
              )}
              {field('Minimum grain', select({ value: draft.minGrain, onChange: v => set({ minGrain: v }), options: GRAINS.map(g => <option key={g}>{g}</option>), aria: 'Minimum grain' }))}
              {field(
                'Allowed grains',
                multi(draft.grains, [...GRAINS], v => set({ grains: v }), 'Allowed grains'),
                undefined,
                true,
              )}
              {field(
                'Breakdowns',
                multi(draft.dimensions, fields, v => set({ dimensions: v }), 'Breakdowns'),
                'Fields the metric may be broken down by',
                true,
              )}
            </div>
          )}
          {step === 4 && (
            <div className="item-fields">
              {field(
                'Direction',
                select({
                  value: draft.direction,
                  onChange: v => set({ direction: v }),
                  options: [
                    ['higher_is_better', 'Higher is better'],
                    ['lower_is_better', 'Lower is better'],
                  ].map(([optionValue, optionLabel]) => (
                    <option key={optionValue} value={optionValue}>
                      {optionLabel}
                    </option>
                  )),
                  aria: 'Target direction',
                  empty: 'No target',
                }),
              )}
              {field('Target', <input aria-label="Target value" inputMode="decimal" value={draft.target} onChange={e => set({ target: e.target.value })} disabled={!draft.direction} />)}
              {field('Per', select({ value: draft.targetGrain, onChange: v => set({ targetGrain: v }), options: GRAINS.map(g => <option key={g}>{g}</option>), aria: 'Target grain' }))}
              {field('Warning at', <input aria-label="Warning threshold" inputMode="decimal" value={draft.warning} onChange={e => set({ warning: e.target.value })} disabled={!draft.direction} />)}
              {field('Critical at', <input aria-label="Critical threshold" inputMode="decimal" value={draft.critical} onChange={e => set({ critical: e.target.value })} disabled={!draft.direction} />)}
            </div>
          )}
          {step === 5 && (
            <div className="item-fields">
              {field('Owner', <OwnerInput project={project} value={draft.owner} onChange={owner => set({ owner })} verified={draft.owner === existing?.owner ? existing?.ownerVerified : undefined} />)}
              {field('Steward', <input aria-label="Steward" value={draft.steward} onChange={e => set({ steward: e.target.value })} />)}
              {field(
                'Status',
                select({ value: draft.status, onChange: v => set({ status: v || 'proposed' }), options: STATUSES.slice(0, 2).map(s => <option key={s}>{s}</option>), aria: 'Status' }),
                'A new metric is a draft or proposed for review',
              )}
              {field('Unit', <input aria-label="Unit" value={draft.unit} onChange={e => set({ unit: e.target.value })} placeholder="ratio, m², BRL" />)}
              {field('Format', <input aria-label="Format" value={draft.format} onChange={e => set({ format: e.target.value })} placeholder="0.0%" />)}
            </div>
          )}
          {step === 6 &&
            (busy && !preview ? (
              <p role="status">Explaining the {existing ? 'metric' : 'new metric'}</p>
            ) : (
              preview && (
                <div className="wizard-preview">
                  <p>
                    <strong>{draft.label}</strong> = <code>{preview.explanation.formula}</code>
                  </p>
                  <h4>Built from</h4>
                  <CompositionTree className="wizard-tree" node={preview.explanation.tree} />
                  <h4>SQL preview</h4>
                  {'refused' in preview.explanation.sqlPreview ? (
                    <p className="item-note">{preview.explanation.sqlPreview.refused}</p>
                  ) : (
                    <pre aria-label="Preview · not executed">
                      <code>
                        <SqlCode sql={preview.explanation.sqlPreview.sql} />
                      </code>
                    </pre>
                  )}
                  <small>Preview, not executed.</small>
                </div>
              )
            ))}
          {step === 7 && preview && (
            <div className="wizard-preview">
              <p>Saving writes these changes in one step:</p>
              {preview.changes.map(change => (
                <div key={change.path}>
                  <h4>
                    {change.path}
                    {change.created ? ' (new file)' : ''}
                  </h4>
                  <pre aria-label={`Changes to ${change.path}`}>
                    {change.added.map(l => '+ ' + l).join('\n')}
                    {change.removed.length ? '\n' + change.removed.map(l => '- ' + l).join('\n') : ''}
                  </pre>
                </div>
              ))}
            </div>
          )}
          {blocking.length > 0 && (
            <ul className="item-findings" aria-label="Before the next step">
              {blocking.map(problem => (
                <li key={problem} className="error">
                  <AlertTriangle size={12} />
                  {problem}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="dialog-error">
              {error}
            </p>
          )}
        </div>
      </section>
    </Modal>
  );
}
