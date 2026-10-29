/** Displays resolved concept mappings and their validation findings. */
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import { apiFetch } from '../projects/api';
import React, { useEffect, useState, useRef } from 'react';
import type { Binding, Finding, RuntimeContext } from '../../server/agent/runtime';
import { QueryComposer } from './QueryComposer';
import { EmptyState } from '../projects/EmptyState';
import { ShowMoreControl } from './ShowMoreControl';
import { agentCatalogPath, agentContextPath } from './agent-paths';
import { chooseMapping, mappingsOfProject, shownMapping } from './mapping-choice';
import { BINDINGS_PER_GROUP, BINDINGS_STEP, CONCEPTS_SHOWN, CONCEPTS_STEP, limitCovering, visibleCount } from './list-window';
import './mapping-explorer.css';
type MappingOption = {
  id: string;
  name: string;
  filename: string;
  embedded: boolean;
  project?: string;
};
const BINDING_ERROR = 'mapping-binding-finding mapping-error';
const BINDING_NOTICE = 'mapping-binding-finding mapping-notice';
const stepLabels = {
  concept: 'Concept',
  relationship: 'Relationship',
  field: 'Field',
  metric: 'Metric',
  dataset: 'Dataset',
  source: 'Physical source',
};
// Offers a line break after each `.` and `_`, so long dotted or snake_case names wrap at their
// natural seams; the text itself is unchanged.
function breakableName(text: string) {
  return text.split(/(?<=[._])/u).map((part, index) => (
    <React.Fragment key={index}>
      {part}
      {/[._]$/u.test(part) && <wbr />}
    </React.Fragment>
  ));
}
function belongsTo(finding: Finding, binding: Binding) {
  const evidence = finding.evidence;
  if (!evidence || evidence.documentId !== binding.evidence.documentId) return false;
  const prefix = (a: (string | number)[], z: (string | number)[]) => a.length <= z.length && a.every((v, i) => v === z[i]);
  return prefix(evidence.path, binding.evidence.path) || prefix(binding.evidence.path, evidence.path);
}
function bindingSteps(binding: Binding, context: RuntimeContext) {
  const steps: { kind: keyof typeof stepLabels; value: string }[] = [{ kind: 'concept', value: binding.rootConcept }];
  for (const name of binding.relationships) steps.push({ kind: 'relationship', value: name });
  if (binding.concept !== binding.rootConcept) steps.push({ kind: 'concept', value: binding.concept });
  const datasets = new Set<string>();
  for (const id of binding.fields) {
    const runtimeField = context.fields.find(f => f.id === id);
    if (runtimeField) {
      steps.push({ kind: 'field', value: `${runtimeField.dataset}.${runtimeField.name}` });
      datasets.add(runtimeField.dataset);
    }
  }
  for (const id of binding.metrics) steps.push({ kind: 'metric', value: context.metrics.find(m => m.id === id)?.name ?? id });
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
/** Says there is no mapping document to show: none in the open project, or no project open. */
function NoMappings({ projectOpen }: { projectOpen: boolean }) {
  if (!projectOpen) {
    return <EmptyState title="Open a project">Mappings shows the mapping documents of the project whose file is open.</EmptyState>;
  }
  return <EmptyState title="This project has no mapping document">Import an Ossie mapping document and its referenced ontology and semantic model, or load the mapped commerce example.</EmptyState>;
}

/** Displays resolved mappings and their findings. */
export function MappingExplorer({
  currentId,
  currentProject,
  revisionKey,
  dirty,
  onEditItem,
  onOpenSource,
}: {
  currentId?: string;
  /** The selected project; the tab offers its mappings only, and none when it is empty. */
  currentProject: string;
  revisionKey: string;
  dirty: boolean;
  onEditItem?: (docId: string, path: (string | number)[]) => void;
  /** Shows the source of the open file, where a binding is added. */
  onOpenSource?: (documentId: string) => void;
}) {
  const requestVersion = useRef(0);
  const [catalog, setCatalog] = useState<MappingOption[]>([]);
  // Derived while rendering, so switching project hides the last project's mapping at once.
  const options = mappingsOfProject(catalog, currentProject);
  const [mappingId, setMappingId] = useRecordedState('mappings.mapping', '');
  const [context, setContext] = useState<RuntimeContext | null>(null);
  const [concept, setConcept] = useRecordedState('mappings.concept', '');
  const [query, setQuery] = useState('');
  const [metrics, setMetrics] = useRecordedState<string[]>('mappings.metrics', []);
  const [dimensions, setDimensions] = useRecordedState<string[]>('mappings.dimensions', []);
  const [plan, setPlan] = useState<any>(null);
  // A failed load shows on the page; a failed query preview shows in the composer.
  const [loadError, setLoadError] = useState('');
  const [planError, setPlanError] = useState('');
  const [loading, setLoading] = useState(false);
  const [composing, setComposing] = useRecordedState('mappings.composing', false);
  // How many bindings each dataset group shows, and how many concepts the list shows.
  const [bindingLimits, setBindingLimits] = useRecordedState<Record<string, number>>('mappings.bindingLimits', {});
  const [conceptLimit, setConceptLimit] = useRecordedState('mappings.conceptLimit', CONCEPTS_SHOWN);
  const conceptList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!currentProject) {
      setCatalog([]);
      return;
    }
    const abort = new AbortController();
    apiFetch(agentCatalogPath(currentProject), { signal: abort.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error);
        setCatalog(body.mappings);
        setMappingId(old => chooseMapping(body.mappings, currentId, currentProject, old));
      })
      .catch(e => {
        if (e.name !== 'AbortError') setLoadError(e.message);
      });
    return () => abort.abort();
  }, [revisionKey, currentId, currentProject]);
  const activeMappingId = shownMapping(options, mappingId);
  // A new mapping choice starts from a clean selection.
  useEffect(() => {
    setPlan(null);
    setMetrics([]);
    setDimensions([]);
    setConcept('');
    setBindingLimits({});
    setConceptLimit(CONCEPTS_SHOWN);
    setPlanError('');
    setComposing(false);
  }, [mappingId, revisionKey]);
  useEffect(() => {
    requestVersion.current++;
    setContext(null);
    setLoadError('');
    setLoading(false);
    if (!activeMappingId) return;
    const abort = new AbortController();
    setLoading(true);
    apiFetch(agentContextPath(currentProject, activeMappingId), { signal: abort.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        setContext(data);
      })
      .catch(e => {
        if (e.name !== 'AbortError') setLoadError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [activeMappingId, revisionKey]);
  const bindings = context?.bindings.filter(b => !concept || b.rootConcept === concept || b.concept === concept) ?? [];
  const groups = new Map<string, Binding[]>();
  for (const binding of bindings) {
    const dataset = context?.fields.find(f => f.id === binding.fields[0])?.dataset ?? '';
    const group = groups.get(dataset) ?? [];
    group.push(binding);
    groups.set(dataset, group);
  }
  const unboundFindings = context?.findings.filter(f => !context.bindings.some(b => belongsTo(f, b))) ?? [];
  const findingContent = (finding: Finding) => (
    <>
      {finding.message}
      {finding.evidence?.path.length ? (
        <button type="button" onClick={() => onEditItem?.(finding.evidence!.documentId, finding.evidence!.path)} disabled={!onEditItem}>
          Edit item
        </button>
      ) : null}
    </>
  );
  const mappingFile = options.find(m => m.id === activeMappingId)?.filename;
  const fieldIds = new Set(bindings.flatMap(b => b.fields));
  const metricIds = new Set(bindings.flatMap(b => b.metrics));
  const fields = context?.fields.filter(f => fieldIds.has(f.id)) ?? [];
  const governed = context?.metrics.filter(m => metricIds.has(m.id)) ?? [];
  const term = query.toLocaleLowerCase().trim();
  const concepts =
    context?.concepts.filter(
      concept =>
        (!concept.builtin || context.bindings.some(b => b.concept === concept.concept || b.rootConcept === concept.concept)) &&
        (!term ||
          [concept.concept, concept.description, ...(Array.isArray(concept.ai_context?.synonyms) ? concept.ai_context.synonyms : [])]
            .filter(x => typeof x === 'string')
            .some(s => s.toLocaleLowerCase().includes(term))),
    ) ?? [];
  const selectedConceptIndex = concepts.findIndex(c => c.concept === concept);
  const shownConcepts = visibleCount(limitCovering(conceptLimit, selectedConceptIndex), concepts.length);
  // The selected concept can sit past the limit, so keep it in view inside the list's own scroll.
  useEffect(() => {
    const selected = conceptList.current?.querySelector('[aria-pressed="true"]:not(:first-child)');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [concept]);
  const showMoreBindings = (dataset: string, shown: number) => setBindingLimits(old => ({ ...old, [dataset]: shown + BINDINGS_STEP }));
  const showFewerBindings = (dataset: string) => setBindingLimits(old => ({ ...old, [dataset]: BINDINGS_PER_GROUP }));
  const toggle = (id: string, values: string[], set: (selected: string[]) => void) => {
    requestVersion.current++;
    setLoading(false);
    set(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
    setPlan(null);
    setPlanError('');
  };
  function openBindingSource() {
    setComposing(false);
    onOpenSource?.(activeMappingId.split('#')[0]);
  }
  const openConcept = (name: string) => {
    requestVersion.current++;
    setLoading(false);
    setConcept(name);
    setBindingLimits({});
    setMetrics([]);
    setDimensions([]);
    setPlan(null);
    setPlanError('');
  };
  function download() {
    if (!context) return;
    const data = { ...context, selectedConcept: concept || null, selectedBindings: bindings };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agent-context.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function preview() {
    const version = ++requestVersion.current;
    setLoading(true);
    setPlanError('');
    setPlan(null);
    try {
      const response = await apiFetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: currentProject,
          mappingId: activeMappingId,
          concepts: concept ? [concept] : [],
          metrics,
          dimensions,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (version === requestVersion.current) setPlan(data);
    } catch (error) {
      if (version === requestVersion.current) setPlanError((error as Error).message);
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
          <p>Follow concepts into fields, metrics and physical sources.</p>
          <p className="mapping-heading-note">Export agent context saves mapping JSON for AI tools.</p>
        </div>
        <div className="mapping-heading-actions">
          <button onClick={() => setComposing(true)} disabled={!context}>
            Compose a query…
          </button>
          <button onClick={download} disabled={!context || loading}>
            Export agent context
          </button>
        </div>
      </div>
      {dirty && <p className="mapping-notice">This view uses saved document revisions. Save your changes to update the runtime context.</p>}
      <label>
        Mapping document
        <select aria-label="Mapping document" value={activeMappingId} onChange={e => setMappingId(e.target.value)}>
          <option value="">Choose a mapping</option>
          {options.map(mappingOption => (
            <option key={mappingOption.id} value={mappingOption.id}>
              {mappingOption.name}
              {mappingOption.embedded ? ' · embedded' : ''}
            </option>
          ))}
        </select>
      </label>
      {!options.length && !loadError && <NoMappings projectOpen={Boolean(currentProject)} />}
      {loading && <p role="status">Resolving saved layers…</p>}
      {loadError && (
        <p role="alert" className="mapping-error">
          {loadError}
        </p>
      )}
      {context && composing && (
        <QueryComposer
          governed={governed}
          fields={fields}
          metrics={metrics}
          dimensions={dimensions}
          onToggleMetric={id => toggle(id, metrics, setMetrics)}
          onToggleDimension={id => toggle(id, dimensions, setDimensions)}
          canPreview={!loading && (metrics.length > 0 || dimensions.length > 0) && !context.findings.some(finding => finding.severity === 'error')}
          loading={loading}
          plan={plan}
          error={planError}
          onPreview={() => void preview()}
          onClose={() => setComposing(false)}
          onOpenSource={onOpenSource ? openBindingSource : undefined}
        />
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
              Physical sources
              <strong>
                {context.datasets.length} {context.datasets.length === 1 ? 'dataset' : 'datasets'}
              </strong>
            </span>
          </div>
          {unboundFindings.length > 0 && (
            <div className="mapping-findings">
              {unboundFindings.map((unboundFinding, i) => (
                <p key={i} className={unboundFinding.severity === 'error' ? 'mapping-error' : 'mapping-notice'}>
                  {findingContent(unboundFinding)}
                </p>
              ))}
            </div>
          )}
          <div className="mapping-columns">
            <div className="mapping-concepts">
              <label>
                Find concept
                <input aria-label="Find concept" placeholder="Concept, description or synonym" value={query} onChange={e => setQuery(e.target.value)} />
              </label>
              <div className="mapping-concept-list" ref={conceptList}>
                <button aria-pressed={!concept} onClick={() => openConcept('')}>
                  All concepts
                </button>
                {context.bindings.length === 0 && !query ? (
                  <p className="mapping-empty-concepts">{concepts.length} concepts, none mapped. Find a concept to inspect it.</p>
                ) : (
                  concepts.slice(0, shownConcepts).map(listedConcept => {
                    const bindingCount = context.bindings.filter(binding => binding.rootConcept === listedConcept.concept || binding.concept === listedConcept.concept).length;
                    return (
                      <button key={listedConcept.concept} aria-pressed={concept === listedConcept.concept} onClick={() => openConcept(listedConcept.concept)}>
                        {listedConcept.concept}
                        <small>
                          {bindingCount} {bindingCount === 1 ? 'binding' : 'bindings'}
                        </small>
                      </button>
                    );
                  })
                )}
                <ShowMoreControl
                  hidden={concepts.length - shownConcepts}
                  step={CONCEPTS_STEP}
                  expanded={shownConcepts > CONCEPTS_SHOWN}
                  noun="concepts"
                  onShowMore={() => setConceptLimit(shownConcepts + CONCEPTS_STEP)}
                  onShowFewer={() => setConceptLimit(CONCEPTS_SHOWN)}
                />
              </div>
            </div>
            <div className="mapping-detail">
              <h3>{concept || 'All concepts'}</h3>
              {!bindings.length && (
                <EmptyState title={concept ? `No binding for ${concept}` : 'No bindings in this mapping'} action={onOpenSource && <button onClick={openBindingSource}>Open Source to add one</button>}>
                  {mappingFile ?? 'This mapping'} does not bind {concept ? 'this concept' : 'any concept'} to a field or metric yet. Add a binding to the mapping file and it shows here, grouped by
                  dataset.
                </EmptyState>
              )}
              {bindings.length > 0 && <p className="mapping-grouping-note">View grouped by dataset.</p>}
              <details className="mapping-bindings" open={bindings.length <= 12} hidden={!bindings.length}>
                <summary>
                  {bindings.length} resolved {bindings.length === 1 ? 'binding' : 'bindings'} · source evidence
                </summary>
                {[...groups].map(([dataset, items]) => {
                  const shown = visibleCount(bindingLimits[dataset] ?? BINDINGS_PER_GROUP, items.length);
                  return (
                    <details className="mapping-group" data-dataset={dataset} key={dataset} open>
                      <summary>
                        {dataset || 'Metrics'} · {items.length} binding
                        {items.length === 1 ? '' : 's'}
                        {dataset && <small> · {context.datasets.find(d => d.name === dataset)?.source ?? 'Unresolved'}</small>}
                      </summary>
                      {items.slice(0, shown).map(binding => (
                        <article className="mapping-binding" role="group" aria-label={`Binding ${binding.rootConcept}`} key={binding.id}>
                          <div className="mapping-binding-chain">
                            {bindingSteps(binding, context).map((step, i) => (
                              <span data-step={step.kind} key={i}>
                                <small className="step-label">{stepLabels[step.kind]}</small>
                                <span>{breakableName(step.value)}</span>
                              </span>
                            ))}
                          </div>
                          <code>{binding.expression}</code>
                          {binding.condition != null && <p className="mapping-condition mapping-notice">Conditional population mapping. Review its meaning before composing a query.</p>}
                          {context.findings
                            .filter(f => belongsTo(f, binding))
                            .map((finding, i) => (
                              <p key={i} className={finding.severity === 'error' ? BINDING_ERROR : BINDING_NOTICE}>
                                {findingContent(finding)}
                              </p>
                            ))}
                          <small>
                            {binding.evidence.filename} · revision {binding.evidence.revision} · /{binding.evidence.path.join('/')}
                          </small>
                          <details>
                            <summary>Mapping evidence</summary>
                            <pre>{JSON.stringify(binding, null, 2)}</pre>
                          </details>
                        </article>
                      ))}
                      <ShowMoreControl
                        hidden={items.length - shown}
                        step={BINDINGS_STEP}
                        expanded={shown > BINDINGS_PER_GROUP}
                        noun="bindings"
                        onShowMore={() => showMoreBindings(dataset, shown)}
                        onShowFewer={() => showFewerBindings(dataset)}
                      />
                    </details>
                  );
                })}
              </details>
              <details>
                <summary>AI context · the metadata an agent receives</summary>
                <pre>{JSON.stringify(context.aiContext, null, 2)}</pre>
              </details>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
