/** Displays a mapping's resolved graph at the saved revision and indicates unsaved edits. */
import { saveCenterPreference } from '../graph/center-preference';
import { parseAddress } from '../../shared/core/item-address';
import { legacyMappingCardKey, legacyMappingKey } from '../../shared/core/item-key-adapters';
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import { api } from '../projects/api';
import React, { useEffect, useMemo, useState } from 'react';
import { LineageCanvas } from '../odcs/LineageCanvas';
import { Modal } from '../projects/Modal';
import type { Fullscreen } from '../graph/fullscreen';
import type { LineageCard, LineageGraph } from '../odcs/lineage';
import { buildMappingGraph, defaultMappingCenter, type MappingContext, type MappingGraph } from './mapping-graph';
// The resolver reads the saved revision for standalone and embedded mappings. The canvas indicates
// when the open document has unsaved edits.
type EditItem = (docId: string, path: (string | number)[]) => void;
type Props = {
  project: string;
  mappingId: string;
  revisionKey: string;
  dirty?: boolean;
  fullscreen?: Fullscreen;
  compact?: boolean;
  center?: string;
  ariaLabel?: string;
  toolbarExtra?: React.ReactNode;
  onEditItem?: EditItem;
};
const unmapped = (c: LineageCard) => !!c.badges?.some(b => b.kind === 'unmapped') || c.columns.some(x => x.badges.some(b => b.kind === 'unmapped'));
/** Displays the resolver's saved mapping graph through the shared lineage canvas. */
export function MappingCanvas({ project, mappingId, revisionKey, dirty, fullscreen, compact, center: requested, ariaLabel = 'Mapping graph', toolbarExtra, onEditItem }: Props) {
  const [context, setContext] = useState<(MappingContext & { bindings: any[] }) | null>(null);
  const [error, setError] = useState('');
  const [preferenceError, setPreferenceError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    api
      .agentContext(project, mappingId, undefined, abort.signal)
      .then(body => setContext(body as typeof context))
      .catch(failure => {
        if (failure.name !== 'AbortError') {
          setError(failure.message);
          setContext(null);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [project, mappingId, revisionKey]);
  const graph = useMemo(() => (context ? buildMappingGraph(context, revisionKey) : null), [context]);
  const [onlyUnmapped, setOnlyUnmapped] = useRecordedState('mappings.onlyUnmapped', false);
  const [finding, setFinding] = useState<{ card: string; message: string } | null>(null);
  const storageKey = `workbench:mapping-center:${mappingId}`;
  const center = useMemo(() => {
    if (!graph) return '';
    if (requested && graph.cards.has(requested)) return requested;
    let stored = '';
    try {
      stored = localStorage.getItem(storageKey) ?? '';
    } catch {}
    const matches = [...graph.cards.values()].filter(card => {
      const parsed = parseAddress(card.id);
      return card.id === stored || (parsed.ok && legacyMappingKey(parsed.address) === stored);
    });
    return matches.length === 1 ? matches[0].id : defaultMappingCenter(graph);
  }, [graph, requested]);
  function saveCenter(id: string) {
    try {
      const parsed = parseAddress(id);
      const card = graph?.cards.get(id);
      if (parsed.ok) saveCenterPreference(localStorage, storageKey, id);
      else if (card?.kind === 'concept' && id === legacyMappingCardKey('concept', card.label)) localStorage.setItem(storageKey, id);
    } catch (failure) {
      setPreferenceError(failure instanceof Error ? failure.message : 'The canvas preference could not be saved.');
    }
  }
  useEffect(() => {
    if (!graph) return;
    try {
      const stored = localStorage.getItem(storageKey);
      const matches = [...graph.cards.values()].filter(card => {
        const parsed = parseAddress(card.id);
        return parsed.ok && legacyMappingKey(parsed.address) === stored;
      });
      if (matches.length === 1) saveCenter(matches[0].id);
    } catch (failure) {
      setPreferenceError(failure instanceof Error ? failure.message : 'The saved canvas preference could not be read.');
    }
  }, [graph, storageKey]);
  const evidenceOf = (message: string) => graph?.findingEvidence.get(message);
  // While resolving or when nothing can be drawn, the toolbar's extra controls (the consolidated
  // file's Graph view switch) stay reachable.
  const state = (node: React.ReactNode) => (
    <div className="mapping-canvas">
      {toolbarExtra && <div className="lineage-toolbar">{toolbarExtra}</div>}
      {node}
    </div>
  );
  if (error)
    return state(
      <p className="mapping-graph-state error" role="alert">
        The mapping could not be resolved: {error}
      </p>,
    );
  if (!graph || !center)
    return state(
      <p className="mapping-graph-state" role="status">
        {loading ? 'Resolving the mapping…' : 'This mapping has no concepts or datasets to draw.'}
      </p>,
    );
  const bindingsOf = (selected: string, path: { edges: Set<number> } | null) => {
    const ids = new Set<string>();
    if (path) for (const i of path.edges) for (const binding of (graph.edges[i] as any).bindings ?? []) ids.add(binding);
    return [...ids].map(id => graph.bindings.get(id)).filter(Boolean) as any[];
  };
  const editBinding = (evidence: { documentId: string; path: (string | number)[] }) => onEditItem?.(evidence.documentId, evidence.path.slice(0, -1));
  return (
    <div className={`mapping-canvas${compact ? ' compact' : ''}`}>
      {preferenceError && <p role="alert">{preferenceError}</p>}
      {dirty && <p className="mapping-notice">The graph shows the saved revision; your edits appear here once they are saved.</p>}
      {graph.findings.length > 0 && (
        <ul className="mapping-graph-findings" aria-label="Mapping findings">
          {graph.findings.map(f => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <LineageCanvas
        mode="mapping"
        initialFit="all"
        key={mappingId}
        graph={graph as unknown as LineageGraph}
        center={center}
        ariaLabel={ariaLabel}
        fullscreen={fullscreen}
        compact={compact}
        storageKey={`workbench:mapping-steps:${mappingId}`}
        onCenterChange={saveCenter}
        cardFilter={onlyUnmapped ? unmapped : undefined}
        onFinding={(card, message) => setFinding({ card: card.label, message })}
        toolbarExtra={
          <>
            {toolbarExtra}
            <label className="lineage-check">
              <input type="checkbox" checked={onlyUnmapped} onChange={e => setOnlyUnmapped(e.target.checked)} />
              Unmapped only
            </label>
          </>
        }
        selectionExtra={(selected, path) => {
          const list = bindingsOf(selected, path);
          if (!list.length) return null;
          return (
            <>
              <h3 className="lineage-bindings-heading">Bindings</h3>
              <ul className="lineage-bindings" aria-label="Bindings">
                {list.map(binding => (
                  <li key={binding.id}>
                    <span>
                      <small>{binding.kind}</small>
                      {binding.rootConcept}
                      {binding.relationships.length ? '.' + binding.relationships.join('.') : ''}
                      {binding.expression ? <code>{binding.expression}</code> : null}
                    </span>
                    <button onClick={() => editBinding(binding.evidence)} disabled={!onEditItem}>
                      Edit item
                    </button>
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      />
      {finding && (
        <Modal
          title="Mapping finding"
          size="narrow"
          onCancel={() => setFinding(null)}
          footer={
            <>
              {(() => {
                const evidence = evidenceOf(finding.message);
                return evidence && onEditItem ? (
                  <button
                    className="primary"
                    onClick={() => {
                      setFinding(null);
                      onEditItem(evidence.documentId, evidence.path);
                    }}
                  >
                    Edit item
                  </button>
                ) : null;
              })()}
              <button onClick={() => setFinding(null)}>Close</button>
            </>
          }
        >
          <p>
            <strong>{finding.card}</strong>
          </p>
          <p>{finding.message}</p>
        </Modal>
      )}
    </div>
  );
}
/** Exports the graph type accepted by the mapping canvas. */
export type { MappingGraph };
