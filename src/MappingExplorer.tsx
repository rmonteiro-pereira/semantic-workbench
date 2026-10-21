import React, { useEffect, useState, useRef } from 'react';
import type { Binding, Finding, RuntimeContext } from '../server/agent/runtime';
import { SqlCode } from './sql/SqlCode';
type MappingOption = { id: string; name: string; filename: string; embedded: boolean };
const stepLabels = {
  concept: 'Concept',
  relationship: 'Relationship',
  field: 'Field',
  metric: 'Metric',
  dataset: 'Dataset',
  source: 'Physical source',
};
function belongsTo(f: Finding, b: Binding) {
  const e = f.evidence;
  if (!e || e.documentId !== b.evidence.documentId) return false;
  const prefix = (a: (string | number)[], z: (string | number)[]) =>
    a.length <= z.length && a.every((v, i) => v === z[i]);
  return prefix(e.path, b.evidence.path) || prefix(b.evidence.path, e.path);
}
function bindingSteps(b: Binding, context: RuntimeContext) {
  const steps: { kind: keyof typeof stepLabels; value: string }[] = [
    { kind: 'concept', value: b.rootConcept },
  ];
  for (const name of b.relationships) steps.push({ kind: 'relationship', value: name });
  if (b.concept !== b.rootConcept) steps.push({ kind: 'concept', value: b.concept });
  const datasets = new Set<string>();
  for (const id of b.fields) {
    const f = context.fields.find(f => f.id === id);
    if (f) {
      steps.push({ kind: 'field', value: `${f.dataset}.${f.name}` });
      datasets.add(f.dataset);
    }
  }
  for (const id of b.metrics)
    steps.push({ kind: 'metric', value: context.metrics.find(m => m.id === id)?.name ?? id });
  for (const name of datasets) {
    steps.push(
      { kind: 'dataset', value: name },
      {
        kind: 'source',
        value: context.datasets.find(d => d.name === name)?.source ?? 'Unresolved',
      },
    );
  }
  return steps;
}
export function MappingExplorer({
  currentId,
  revisionKey,
  dirty,
  onEditItem,
}: {
  currentId?: string;
  revisionKey: string;
  dirty: boolean;
  onEditItem?: (docId: string, path: (string | number)[]) => void;
}) {
  const requestVersion = useRef(0);
  const [options, setOptions] = useState<MappingOption[]>([]);
  const [mappingId, setMappingId] = useState('');
  const [context, setContext] = useState<RuntimeContext | null>(null);
  const [concept, setConcept] = useState('');
  const [query, setQuery] = useState('');
  const [metrics, setMetrics] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/agent/catalog', { signal: abort.signal })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setOptions(d.mappings);
        setMappingId(
          old =>
            d.mappings.find(
              (m: MappingOption) => m.id === currentId || m.id.startsWith(currentId + '#'),
            )?.id ??
            (d.mappings.some((m: MappingOption) => m.id === old) ? old : (d.mappings[0]?.id ?? '')),
        );
      })
      .catch(e => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => abort.abort();
  }, [revisionKey, currentId]);
  useEffect(() => {
    requestVersion.current++;
    setContext(null);
    setPlan(null);
    setMetrics([]);
    setDimensions([]);
    setConcept('');
    setError('');
    if (!mappingId) return;
    const abort = new AbortController();
    setLoading(true);
    fetch('/api/agent/context?mappingId=' + encodeURIComponent(mappingId), { signal: abort.signal })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        setContext(data);
      })
      .catch(e => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [mappingId, revisionKey]);
  const bindings =
    context?.bindings.filter(b => !concept || b.rootConcept === concept || b.concept === concept) ??
    [];
  const groups = new Map<string, Binding[]>();
  for (const b of bindings) {
    const dataset = context?.fields.find(f => f.id === b.fields[0])?.dataset ?? '';
    const group = groups.get(dataset) ?? [];
    group.push(b);
    groups.set(dataset, group);
  }
  const unboundFindings =
    context?.findings.filter(f => !context.bindings.some(b => belongsTo(f, b))) ?? [];
  const findingContent = (f: Finding) => (
    <>
      {f.message}
      {f.evidence?.path.length ? (
        <button
          type="button"
          onClick={() => onEditItem?.(f.evidence!.documentId, f.evidence!.path)}
          disabled={!onEditItem}
        >
          Edit item
        </button>
      ) : null}
    </>
  );
  const fieldIds = new Set(bindings.flatMap(b => b.fields));
  const metricIds = new Set(bindings.flatMap(b => b.metrics));
  const fields = context?.fields.filter(f => fieldIds.has(f.id)) ?? [];
  const governed = context?.metrics.filter(m => metricIds.has(m.id)) ?? [];
  const term = query.toLocaleLowerCase().trim();
  const concepts =
    context?.concepts.filter(
      c =>
        (!c.builtin ||
          context.bindings.some(b => b.concept === c.concept || b.rootConcept === c.concept)) &&
        (!term ||
          [
            c.concept,
            c.description,
            ...(Array.isArray(c.ai_context?.synonyms) ? c.ai_context.synonyms : []),
          ]
            .filter(x => typeof x === 'string')
            .some(s => s.toLocaleLowerCase().includes(term))),
    ) ?? [];
  const toggle = (id: string, values: string[], set: (v: string[]) => void) => {
    requestVersion.current++;
    setLoading(false);
    set(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
    setPlan(null);
    setError('');
  };
  const openConcept = (name: string) => {
    requestVersion.current++;
    setLoading(false);
    setConcept(name);
    setMetrics([]);
    setDimensions([]);
    setPlan(null);
    setError('');
  };
  function download() {
    if (!context) return;
    const data = { ...context, selectedConcept: concept || null, selectedBindings: bindings };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agent-context.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function preview() {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      const r = await fetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappingId,
          concepts: concept ? [concept] : [],
          metrics,
          dimensions,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      if (version === requestVersion.current) setPlan(data);
    } catch (e) {
      if (version === requestVersion.current) setError((e as Error).message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }
  return (
    <div className="mapping-explorer">
      <div className="mapping-heading">
        <div>
          <small>CONNECTED LAYERS</small>
          <h2>Ontology mappings</h2>
          <p>Follow business concepts into governed fields, metrics and physical sources.</p>
        </div>
        <button onClick={download} disabled={!context || loading}>
          Export agent context
        </button>
      </div>
      {dirty && (
        <p className="mapping-notice">
          This view uses saved document revisions. Save your changes to update the runtime context.
        </p>
      )}
      <label>
        Mapping document
        <select
          aria-label="Mapping document"
          value={mappingId}
          onChange={e => setMappingId(e.target.value)}
        >
          <option value="">Choose a mapping</option>
          {options.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.embedded ? ' · embedded' : ''}
            </option>
          ))}
        </select>
      </label>
      {!options.length && !error && (
        <p>
          Import an Ossie mapping document and its referenced ontology and semantic model, or load
          the mapped commerce example.
        </p>
      )}
      {loading && <p role="status">Resolving saved layers…</p>}
      {error && (
        <p role="alert" className="mapping-error">
          {error}
        </p>
      )}
      {context && (
        <>
          <div className="mapping-layer-chain">
            <span>
              Ontology<strong>{context.ontology.name ?? 'Unresolved'}</strong>
            </span>
            <span>
              Mapping<strong>{context.name}</strong>
            </span>
            <span>
              Semantic model<strong>{context.semanticModel.name ?? 'Unresolved'}</strong>
            </span>
            <span>
              Physical sources<strong>{context.datasets.length} datasets</strong>
            </span>
          </div>
          {unboundFindings.length > 0 && (
            <div className="mapping-findings">
              {unboundFindings.map((f, i) => (
                <p key={i} className={f.severity === 'error' ? 'mapping-error' : 'mapping-notice'}>
                  {findingContent(f)}
                </p>
              ))}
            </div>
          )}
          <div className="mapping-columns">
            <div className="mapping-concepts">
              <label>
                Find concept
                <input
                  aria-label="Find concept"
                  placeholder="Concept, description or synonym"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
              <button aria-pressed={!concept} onClick={() => openConcept('')}>
                All mapped concepts
              </button>
              {concepts.map(c => (
                <button
                  key={c.concept}
                  aria-pressed={concept === c.concept}
                  onClick={() => openConcept(c.concept)}
                >
                  {c.concept}
                  <small>
                    {
                      context.bindings.filter(
                        b => b.rootConcept === c.concept || b.concept === c.concept,
                      ).length
                    }{' '}
                    bindings
                  </small>
                </button>
              ))}
            </div>
            <div className="mapping-detail">
              <h3>{concept || 'All concepts'}</h3>
              {!bindings.length && <p>No resolved bindings for this selection.</p>}
              <p className="mapping-grouping-note">View grouped by dataset.</p>
              <details className="mapping-bindings" open={bindings.length <= 12}>
                <summary>{bindings.length} resolved bindings · source evidence</summary>
                {[...groups].map(([dataset, items]) => (
                  <details className="mapping-group" data-dataset={dataset} key={dataset} open>
                    <summary>
                      {dataset || 'Metrics'} · {items.length} binding{items.length === 1 ? '' : 's'}
                      {dataset && (
                        <small>
                          {' '}
                          · {context.datasets.find(d => d.name === dataset)?.source ?? 'Unresolved'}
                        </small>
                      )}
                    </summary>
                    {items.map(b => (
                      <article
                        className="mapping-binding"
                        role="group"
                        aria-label={`Binding ${b.rootConcept}`}
                        key={b.id}
                      >
                        <div className="mapping-binding-chain">
                          {bindingSteps(b, context).map((step, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && (
                                <span className="mapping-arrow" aria-hidden="true">
                                  →
                                </span>
                              )}
                              <span data-step={step.kind}>
                                <small className="step-label">{stepLabels[step.kind]}</small>
                                <span>{step.value}</span>
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                        <code>{b.expression}</code>
                        {b.condition != null && (
                          <p className="mapping-condition mapping-notice">
                            Conditional population mapping. Review its meaning before composing a
                            query.
                          </p>
                        )}
                        {context.findings
                          .filter(f => belongsTo(f, b))
                          .map((f, i) => (
                            <p
                              key={i}
                              className={`mapping-binding-finding ${f.severity === 'error' ? 'mapping-error' : 'mapping-notice'}`}
                            >
                              {findingContent(f)}
                            </p>
                          ))}
                        <small>
                          {b.evidence.filename} · revision {b.evidence.revision} · /
                          {b.evidence.path.join('/')}
                        </small>
                        <details>
                          <summary>Mapping evidence</summary>
                          <pre>{JSON.stringify(b, null, 2)}</pre>
                        </details>
                      </article>
                    ))}
                  </details>
                ))}
              </details>
              <details>
                <summary>AI context · source metadata</summary>
                <pre>{JSON.stringify(context.aiContext, null, 2)}</pre>
              </details>
            </div>
            <div className="mapping-query">
              <h3>Compose a query</h3>
              <p>
                Select mapped building blocks. Governed formulas remain unchanged; joins must be
                declared in the semantic model.
              </p>
              <fieldset>
                <legend>Governed metrics</legend>
                {!governed.length && <p>No metrics mapped to this selection.</p>}
                {governed.map(m => (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      aria-label={`Metric ${m.name}`}
                      checked={metrics.includes(m.id)}
                      onChange={() => toggle(m.id, metrics, setMetrics)}
                    />
                    {m.name}
                    <code>
                      {m.definition.expression.dialects.find((d: any) => d.dialect === 'ANSI_SQL')
                        ?.expression ?? 'No ANSI_SQL expression'}
                    </code>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Group by mapped fields</legend>
                {fields.map(f => (
                  <label key={f.id}>
                    <input
                      type="checkbox"
                      aria-label={`Dimension ${f.dataset}.${f.name}`}
                      checked={dimensions.includes(f.id)}
                      onChange={() => toggle(f.id, dimensions, setDimensions)}
                    />
                    {f.dataset}.{f.name}
                  </label>
                ))}
              </fieldset>
              <button
                className="primary"
                onClick={preview}
                disabled={
                  loading ||
                  (!metrics.length && !dimensions.length) ||
                  context.findings.some(f => f.severity === 'error')
                }
              >
                Preview governed query
              </button>
              {plan && (
                <div className="mapping-plan">
                  <h4>SQL preview · not executed</h4>
                  <pre aria-label="Governed SQL preview">
                    <SqlCode sql={plan.sql} />
                  </pre>
                  <details>
                    <summary>Query provenance</summary>
                    <pre>{JSON.stringify(plan, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
