/** Validates metric creation step by step and previews the server's plan without executing SQL. */
import { CompositionTree } from './Explanation';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { KpiExplanation, KpiSummary } from '../../server/agent/explain';
import { Modal } from '../projects/Modal';
import { api, StaleSave, type Doc, type KpiSaveRequest } from '../projects/api';
import { validateInput } from '../input';
import { semanticModelPrefix, STATUSES, type Path } from '../edit/item-model';
import { GRAINS, VENDOR, readMetricExtension, type KpiType } from './extension';
import { typeLabel } from './format';
import { expressionFor, extensionFor, list, type Draft } from './metric-draft';
import '../edit/edit.css';
import { SqlField } from '../editor/SqlField';
import { SqlCode } from '../sql/SqlCode';
import { OwnerInput } from './OwnerInput';
// Each step must validate before advancing; the server’s SQL preview is never executed. Save
// writes the metric and its extension to the model and its concept binding to the mapping.
function prefill(k: KpiSummary): Partial<Draft> {
  const agg = aggregationOf(k.expression);
  return {
    file: k.file,
    name: k.name,
    label: k.label,
    description: k.description ?? '',
    type: k.type,
    expression: k.expression ?? '',
    inputs: k.inputs.join(', '),
    ...(k.type === 'ratio' ? { numerator: k.inputs[0] ?? '', denominator: k.inputs[1] ?? '' } : {}),
    ...(agg ? { aggregation: agg.aggregation, field: agg.field } : {}),
    measures: k.concepts.find(c => c.role === 'measures')?.concept ?? '',
    of: k.concepts.find(c => c.role === 'of')?.concept ?? '',
    unit: k.unit ?? '',
    format: k.format ?? '',
  };
}
const STEPS = [
  'Concept',
  'Data',
  'Type and inputs',
  'Time and breakdowns',
  'Targets',
  'Governance',
  'Explanation and SQL',
  'Save',
] as const;
type Model = {
  file: string;
  path: Path;
  name: string;
  datasets: { name: string; fields: string[] }[];
  metrics: string[];
};
const AGGREGATIONS = ['SUM', 'COUNT', 'COUNT DISTINCT', 'AVG', 'MIN', 'MAX'];
const snake = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, '_$1');
function modelsOf(docs: Doc[]): Model[] {
  return docs.flatMap(d => {
    const v = validateInput(d.source, d.filename);
    if (!v.valid || !('document' in v.model)) return [];
    const doc = v.model.document;
    const prefix = semanticModelPrefix(doc);
    if (!prefix) return [];
    const m = prefix.reduce((x: any, k) => x?.[k], doc);
    if (!m || !Array.isArray(m.datasets)) return [];
    return [
      {
        file: d.path,
        path: prefix,
        name: String(m.name ?? d.path),
        datasets: m.datasets.map((ds: any) => ({
          name: ds.name,
          fields: (ds.fields ?? []).map((f: any) => f.name),
        })),
        metrics: (m.metrics ?? []).map((x: any) => x.name),
      },
    ];
  });
}
const conceptsOf = (docs: Doc[]) =>
  [
    ...new Set(
      docs.flatMap(d => {
        const v = validateInput(d.source, d.filename);
        return v.valid && 'document' in v.model && Array.isArray(v.model.document.ontology)
          ? v.model.document.ontology.map((c: any) => c?.concept).filter(Boolean)
          : [];
      }),
    ),
  ].sort() as string[];
// An existing metric keeps its name and expression. Only workbench attributes and a missing
// concept binding are added.
const aggregationOf = (expression = '') => {
  const m = /^\s*(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?([^()]+?)\s*\)\s*$/i.exec(expression);
  return m
    ? {
        aggregation: m[1].toUpperCase() === 'COUNT' && m[2] ? 'COUNT DISTINCT' : m[1].toUpperCase(),
        field: m[3],
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
  const [d, setD] = useState<Draft>({
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
    setD(x => ({ ...x, ...patch }));
    setPreview(null);
  };
  const model = models.find(m => m.file === d.file);
  const fields = model?.datasets.flatMap(ds => ds.fields.map(f => `${ds.name}.${f}`)) ?? [];
  const labelOf = (name: string) => kpis.find(k => k.name === name && k.file === d.file)?.label;
  const metricOption = (name: string) => (
    <option key={name} value={name}>
      {labelOf(name) ? `${labelOf(name)} (${name})` : name}
    </option>
  );
  // An existing metric keeps its expression; one already bound to concepts keeps its binding.
  const bound = !!existing?.concepts.length;
  const expression = existing ? (existing.expression ?? '') : expressionFor(d);
  const extension = extensionFor(d);
  const request: KpiSaveRequest = {
    semanticPath: d.file,
    modelPath: existing ? existing.modelPath : model?.path,
    ...(existing ? { existing: true } : {}),
    metric: {
      name: d.name,
      expression,
      ...(d.description.trim() ? { description: d.description.trim() } : {}),
    },
    extension,
    ...(d.measures && !bound
      ? { binding: { measures: d.measures, ...(d.of ? { of: d.of } : {}) } }
      : {}),
  };
  // What blocks each step.
  const problems = (i: number): string[] => {
    const out: string[] = [];
    if (i === 1 && !model) out.push('Choose the semantic model that holds the data.');
    if (i === 2) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(d.name))
        out.push('Give the metric a name of letters, digits and underscores.');
      else if (!existing && model?.metrics.includes(d.name))
        out.push(`${d.name} already exists in ${model.name}.`);
      if (!d.label.trim()) out.push('Give the metric a label people will read.');
    }
    if (i === 2 && !existing) {
      if (d.type === 'simple' && !d.field) out.push('Choose the field to aggregate.');
      if (d.type === 'ratio' && (!d.numerator || !d.denominator))
        out.push('Choose the numerator and the denominator.');
      if (d.type === 'ratio' && d.numerator && d.numerator === d.denominator)
        out.push('Numerator and denominator must differ.');
      if (['derived', 'cumulative', 'filtered'].includes(d.type) && !list(d.inputs).length)
        out.push('Choose the input metrics.');
      if (['derived', 'cumulative', 'filtered'].includes(d.type) && !expression)
        out.push('Write the expression over the input metrics.');
      if (d.type === 'filtered' && !d.filterField) out.push('Choose the filter field.');
    }
    if (i === 3 && d.timeDimension && !/^[^.\s]+\.[^.\s]+$/.test(d.timeDimension))
      out.push('The time dimension is a dataset.field.');
    if (i === 3 && d.minGrain && d.grains.length && !d.grains.includes(d.minGrain))
      out.push('The allowed grains must include the minimum grain.');
    if (i === 4 && d.direction && (d.target.trim() === '' || Number.isNaN(Number(d.target))))
      out.push('The target is a number.');
    if (i === 4 && [d.warning, d.critical].some(v => v.trim() !== '' && Number.isNaN(Number(v))))
      out.push('Thresholds are numbers.');
    if (i === 5 && !d.owner.trim()) out.push('Name the owner who answers for this metric.');
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
      onSaved(d.file, model!.path, d.name);
    } catch (e) {
      setError(
        e instanceof StaleSave
          ? 'Not saved: a file of the project changed meanwhile. Close the wizard and start again.'
          : (e as Error).message,
      );
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
  const select = (
    value: string,
    onChange: (v: string) => void,
    options: React.ReactNode,
    aria: string,
    empty = '—',
  ) => (
    <select aria-label={aria} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {options}
    </select>
  );
  const multi = (
    values: string[],
    options: string[],
    onChange: (v: string[]) => void,
    aria: string,
  ) => (
    <div className="wizard-checks" role="group" aria-label={aria}>
      {options.map(o => (
        <label key={o} className="item-check">
          <input
            type="checkbox"
            checked={values.includes(o)}
            onChange={e =>
              onChange(e.target.checked ? [...values, o] : values.filter(x => x !== o))
            }
          />
          {o}
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
        <button
          type="button"
          className="primary"
          onClick={() => go(step + 1)}
          disabled={blocking.length > 0 || (step === 6 && !preview)}
        >
          Next
        </button>
      ) : (
        <button type="button" className="primary" onClick={save} disabled={busy || !preview}>
          {busy ? 'Saving…' : 'Save to file'}
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
        <div className="wizard-progress">
          <h3>
            Step {step + 1} of {STEPS.length}
          </h3>
          <select
            aria-label="Go to step"
            value={step}
            onChange={event => setStep(Number(event.target.value))}
          >
            {STEPS.map((name, index) => (
              <option key={name} value={index} disabled={index > done}>
                {index + 1}. {name}
              </option>
            ))}
          </select>
        </div>
        {step === 0 && bound && (
          <p>
            {existing!.label} is already bound: it measures <strong>{d.measures || '—'}</strong>
            {d.of && (
              <>
                {' '}
                of <strong>{d.of}</strong>
              </>
            )}
            . The binding stays as it is.
          </p>
        )}
        {step === 0 && !bound && (
          <>
            <p>
              Which business concept does this metric measure, and what is it about? The binding is
              stored in the project's mapping document.
            </p>
            <div className="item-fields">
              {field(
                'Business concept',
                <input
                  list="kpi-concepts"
                  aria-label="Concept measured"
                  value={d.measures}
                  onChange={e => set({ measures: e.target.value })}
                  placeholder="Concept name"
                />,
                'The concept this metric measures. Leave empty to save the metric without one.',
              )}
              {field(
                'Computed per',
                <input
                  list="kpi-concepts"
                  aria-label="Concept it is about"
                  value={d.of}
                  onChange={e => set({ of: e.target.value })}
                  placeholder="Entity name"
                />,
                'Optional. The entity the value is computed for, such as Property.',
              )}
              <datalist id="kpi-concepts">
                {concepts.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {d.measures && !concepts.includes(d.measures) && (
                <p className="item-note wide">
                  <AlertTriangle size={13} />
                  {d.measures} is not a concept of the project's ontology; the metric will show a
                  finding until it exists.
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
                  select(
                    d.file,
                    v => set({ file: v, field: '', numerator: '', denominator: '', inputs: '' }),
                    models.map(m => (
                      <option key={m.file + m.path.join('/')} value={m.file}>
                        {m.name} ({m.file})
                      </option>
                    )),
                    'Semantic model',
                    'Choose…',
                  ),
                  undefined,
                  true,
                )
              )}
              {model && (
                <p className="wide">
                  {model.datasets.length} datasets · {model.metrics.length} metrics:{' '}
                  {model.datasets.map(x => x.name).join(', ')}
                </p>
              )}
            </div>
          </>
        )}
        {step === 2 && existing && (
          <div className="item-fields">
            {field(
              'Label',
              <input
                aria-label="Label"
                value={d.label}
                onChange={e => set({ label: e.target.value })}
              />,
            )}
            {field(
              'Name',
              <input aria-label="Name" value={d.name} readOnly />,
              'As written in the semantic model',
            )}
            {field(
              'Type',
              select(
                d.type,
                v => set({ type: (v || 'simple') as KpiType }),
                (['simple', 'ratio', 'derived', 'cumulative', 'filtered'] as KpiType[]).map(t => (
                  <option key={t} value={t}>
                    {typeLabel[t]}
                  </option>
                )),
                'Metric type',
              ),
              existing.typeDeclared ? undefined : 'Read from the expression',
            )}
            {d.type === 'ratio' && (
              <>
                {field(
                  'Numerator',
                  select(
                    d.numerator,
                    v => set({ numerator: v }),
                    model?.metrics.map(metricOption),
                    'Numerator',
                    'Choose…',
                  ),
                )}
                {field(
                  'Denominator',
                  select(
                    d.denominator,
                    v => set({ denominator: v }),
                    model?.metrics.map(metricOption),
                    'Denominator',
                    'Choose…',
                  ),
                )}
              </>
            )}
            {['derived', 'cumulative', 'filtered'].includes(d.type) &&
              field(
                'Input metrics',
                <input
                  aria-label="Input metrics"
                  value={d.inputs}
                  onChange={e => set({ inputs: e.target.value })}
                />,
                'Metric names, separated by commas',
              )}
            {field(
              'Additivity',
              select(
                d.additivity,
                v => set({ additivity: v }),
                ['additive', 'semi_additive', 'non_additive'].map(a => (
                  <option key={a}>{a}</option>
                )),
                'Additivity',
                'From the type',
              ),
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
                value={d.label}
                onChange={e =>
                  set({
                    label: e.target.value,
                    ...(d.name === snake(d.label) || !d.name
                      ? { name: snake(e.target.value) }
                      : {}),
                  })
                }
                placeholder="Vacancy rate"
              />,
            )}
            {field(
              'Name',
              <input
                aria-label="Name"
                value={d.name}
                onChange={e => set({ name: e.target.value })}
              />,
              'The metric name in the semantic model',
            )}
            {field(
              'Type',
              select(
                d.type,
                v => set({ type: (v || 'simple') as KpiType }),
                (['simple', 'ratio', 'derived', 'cumulative', 'filtered'] as KpiType[]).map(t => (
                  <option key={t} value={t}>
                    {typeLabel[t]}
                  </option>
                )),
                'Metric type',
              ),
            )}
            {d.type === 'simple' && (
              <>
                {field(
                  'Aggregation',
                  select(
                    d.aggregation,
                    v => set({ aggregation: v || 'SUM' }),
                    AGGREGATIONS.map(a => <option key={a}>{a}</option>),
                    'Aggregation',
                  ),
                )}
                {field(
                  'Field',
                  select(
                    d.field,
                    v => set({ field: v }),
                    fields.map(f => <option key={f}>{f}</option>),
                    'Field to aggregate',
                    'Choose…',
                  ),
                )}
              </>
            )}
            {d.type === 'ratio' && (
              <>
                {field(
                  'Numerator',
                  select(
                    d.numerator,
                    v => set({ numerator: v }),
                    model?.metrics.map(metricOption),
                    'Numerator',
                    'Choose…',
                  ),
                )}
                {field(
                  'Denominator',
                  select(
                    d.denominator,
                    v => set({ denominator: v }),
                    model?.metrics.map(metricOption),
                    'Denominator',
                    'Choose…',
                  ),
                  'Division by zero gives no value (NULLIF)',
                )}
              </>
            )}
            {['derived', 'cumulative', 'filtered'].includes(d.type) && (
              <>
                {field(
                  'Input metrics',
                  <input
                    aria-label="Input metrics"
                    list="kpi-metrics"
                    value={d.inputs}
                    onChange={e =>
                      set({
                        inputs: e.target.value,
                        ...(!d.expression && d.type !== 'derived'
                          ? { expression: list(e.target.value)[0] ?? '' }
                          : {}),
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
                  <SqlField
                    ariaLabel="Expression"
                    dialect="ANSI_SQL"
                    rows={2}
                    value={d.expression}
                    onChange={v => set({ expression: v })}
                  />,
                  'ANSI SQL over the input metrics; warnings never block',
                  true,
                )}
              </>
            )}
            {d.type === 'cumulative' && (
              <>
                {field(
                  'Window',
                  select(
                    d.window,
                    v => set({ window: v }),
                    ['to_date', 'rolling', 'all'].map(w => <option key={w}>{w}</option>),
                    'Window',
                  ),
                )}
                {field(
                  'Window grain',
                  select(
                    d.windowGrain,
                    v => set({ windowGrain: v }),
                    GRAINS.map(g => <option key={g}>{g}</option>),
                    'Window grain',
                  ),
                )}
                {d.window === 'rolling' &&
                  field(
                    'Length',
                    <input
                      aria-label="Window length"
                      value={d.windowLength}
                      onChange={e => set({ windowLength: e.target.value })}
                    />,
                  )}
              </>
            )}
            {d.type === 'filtered' && (
              <>
                {field(
                  'Filter field',
                  select(
                    d.filterField,
                    v => set({ filterField: v }),
                    fields.map(f => <option key={f}>{f}</option>),
                    'Filter field',
                  ),
                )}
                {field(
                  'Operator',
                  select(
                    d.filterOperator,
                    v => set({ filterOperator: v }),
                    [
                      'equals',
                      'not_equals',
                      'in',
                      'not_in',
                      'gt',
                      'gte',
                      'lt',
                      'lte',
                      'is_null',
                      'is_not_null',
                    ].map(o => <option key={o}>{o}</option>),
                    'Filter operator',
                  ),
                )}
                {field(
                  'Value',
                  <input
                    aria-label="Filter value"
                    value={d.filterValue}
                    onChange={e => set({ filterValue: e.target.value })}
                  />,
                )}
              </>
            )}
            {field(
              'Additivity',
              select(
                d.additivity,
                v => set({ additivity: v }),
                ['additive', 'semi_additive', 'non_additive'].map(a => (
                  <option key={a}>{a}</option>
                )),
                'Additivity',
                'From the type',
              ),
              d.type === 'ratio' ? 'A ratio is never summed across groups' : undefined,
            )}
            {field(
              'Description',
              <textarea
                aria-label="Description"
                rows={2}
                value={d.description}
                onChange={e => set({ description: e.target.value })}
              />,
              undefined,
              true,
            )}
            <p className="wide formula-line">
              Expression: <code>{expression || '—'}</code>
            </p>
          </div>
        )}
        {step === 3 && (
          <div className="item-fields">
            {field(
              'Time dimension',
              select(
                d.timeDimension,
                v => set({ timeDimension: v }),
                fields.map(f => <option key={f}>{f}</option>),
                'Time dimension',
                'None',
              ),
              'The date field the metric is reported over',
            )}
            {field(
              'Minimum grain',
              select(
                d.minGrain,
                v => set({ minGrain: v }),
                GRAINS.map(g => <option key={g}>{g}</option>),
                'Minimum grain',
              ),
            )}
            {field(
              'Allowed grains',
              multi(d.grains, [...GRAINS], v => set({ grains: v }), 'Allowed grains'),
              undefined,
              true,
            )}
            {field(
              'Breakdowns',
              multi(d.dimensions, fields, v => set({ dimensions: v }), 'Breakdowns'),
              'Fields the metric may be broken down by',
              true,
            )}
          </div>
        )}
        {step === 4 && (
          <div className="item-fields">
            {field(
              'Direction',
              select(
                d.direction,
                v => set({ direction: v }),
                [
                  ['higher_is_better', 'Higher is better'],
                  ['lower_is_better', 'Lower is better'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                )),
                'Target direction',
                'No target',
              ),
            )}
            {field(
              'Target',
              <input
                aria-label="Target value"
                inputMode="decimal"
                value={d.target}
                onChange={e => set({ target: e.target.value })}
                disabled={!d.direction}
              />,
            )}
            {field(
              'Per',
              select(
                d.targetGrain,
                v => set({ targetGrain: v }),
                GRAINS.map(g => <option key={g}>{g}</option>),
                'Target grain',
              ),
            )}
            {field(
              'Warning at',
              <input
                aria-label="Warning threshold"
                inputMode="decimal"
                value={d.warning}
                onChange={e => set({ warning: e.target.value })}
                disabled={!d.direction}
              />,
            )}
            {field(
              'Critical at',
              <input
                aria-label="Critical threshold"
                inputMode="decimal"
                value={d.critical}
                onChange={e => set({ critical: e.target.value })}
                disabled={!d.direction}
              />,
            )}
          </div>
        )}
        {step === 5 && (
          <div className="item-fields">
            {field(
              'Owner',
              <OwnerInput
                project={project}
                value={d.owner}
                onChange={owner => set({ owner })}
                verified={d.owner === existing?.owner ? existing?.ownerVerified : undefined}
              />,
            )}
            {field(
              'Steward',
              <input
                aria-label="Steward"
                value={d.steward}
                onChange={e => set({ steward: e.target.value })}
              />,
            )}
            {field(
              'Status',
              select(
                d.status,
                v => set({ status: v || 'proposed' }),
                STATUSES.slice(0, 2).map(s => <option key={s}>{s}</option>),
                'Status',
              ),
              'A new metric is a draft or proposed for review',
            )}
            {field(
              'Unit',
              <input
                aria-label="Unit"
                value={d.unit}
                onChange={e => set({ unit: e.target.value })}
                placeholder="ratio, m², BRL"
              />,
            )}
            {field(
              'Format',
              <input
                aria-label="Format"
                value={d.format}
                onChange={e => set({ format: e.target.value })}
                placeholder="0.0%"
              />,
            )}
          </div>
        )}
        {step === 6 &&
          (busy && !preview ? (
            <p role="status">Explaining the {existing ? 'metric' : 'new metric'}…</p>
          ) : (
            preview && (
              <div className="wizard-preview">
                <p>
                  <strong>{d.label}</strong> = <code>{preview.explanation.formula}</code>
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
            {preview.changes.map(c => (
              <div key={c.path}>
                <h4>
                  {c.path}
                  {c.created ? ' (new file)' : ''}
                </h4>
                <pre aria-label={`Changes to ${c.path}`}>
                  {c.added.map(l => '+ ' + l).join('\n')}
                  {c.removed.length ? '\n' + c.removed.map(l => '- ' + l).join('\n') : ''}
                </pre>
              </div>
            ))}
          </div>
        )}
        {blocking.length > 0 && (
          <ul className="item-findings" aria-label="Before the next step">
            {blocking.map(p => (
              <li key={p} className="error">
                <AlertTriangle size={12} />
                {p}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="dialog-error">
            {error}
          </p>
        )}
      </section>
    </Modal>
  );
}
