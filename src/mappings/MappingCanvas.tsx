import React, { useEffect, useMemo, useState } from 'react';
import { LineageCanvas } from '../odcs/LineageCanvas';
import { Modal } from '../projects/Modal';
import type { Fullscreen } from '../graph/fullscreen';
import type { LineageCard, LineageGraph } from '../odcs/lineage';
import {
  buildMappingGraph,
  defaultMappingCenter,
  type MappingContext,
  type MappingGraph,
} from './mapping-graph';
// The mapping canvas (FR-028–FR-034, ui-contracts "Mapping canvas"): the lineage canvas over the
// resolver's context for one mapping (a standalone document, or a consolidated file's embedded
// mappings). It follows the saved revision, like the Mappings tab, and says so while the open file
// has unsaved edits.
type EditItem = (docId: string, path: (string | number)[]) => void;
type Props = {
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
const unmapped = (c: LineageCard) =>
  !!c.badges?.some(b => b.kind === 'unmapped') ||
  c.columns.some(x => x.badges.some(b => b.kind === 'unmapped'));
export function MappingCanvas({
  mappingId,
  revisionKey,
  dirty,
  fullscreen,
  compact,
  center: requested,
  ariaLabel = 'Mapping graph',
  toolbarExtra,
  onEditItem,
}: Props) {
  const [context, setContext] = useState<(MappingContext & { bindings: any[] }) | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/agent/context?mappingId=' + encodeURIComponent(mappingId), { signal: abort.signal })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setContext(d);
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setContext(null);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [mappingId, revisionKey]);
  const graph = useMemo(
    () => (context ? buildMappingGraph(context, revisionKey) : null),
    [context],
  );
  const [onlyUnmapped, setOnlyUnmapped] = useState(false),
    [finding, setFinding] = useState<{ card: string; message: string } | null>(null);
  const storageKey = `workbench:mapping-center:${mappingId}`;
  const center = useMemo(() => {
    if (!graph) return '';
    if (requested && graph.cards.has(requested)) return requested;
    let stored = '';
    try {
      stored = localStorage.getItem(storageKey) ?? '';
    } catch {}
    return graph.cards.has(stored) ? stored : defaultMappingCenter(graph);
  }, [graph, requested]);
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
    if (path)
      for (const i of path.edges)
        for (const b of (graph.edges[i] as any).bindings ?? []) ids.add(b);
    return [...ids].map(id => graph.bindings.get(id)).filter(Boolean) as any[];
  };
  return (
    <div className={`mapping-canvas${compact ? ' compact' : ''}`}>
      {dirty && (
        <p className="mapping-notice">
          The graph shows the saved revision; your edits appear here once they are saved.
        </p>
      )}
      {graph.findings.length > 0 && (
        <ul className="mapping-graph-findings" aria-label="Mapping findings">
          {graph.findings.map(f => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <LineageCanvas
        mode="mapping"
        key={mappingId}
        graph={graph as unknown as LineageGraph}
        center={center}
        ariaLabel={ariaLabel}
        fullscreen={fullscreen}
        compact={compact}
        storageKey={`workbench:mapping-steps:${mappingId}`}
        onCenterChange={id => {
          try {
            localStorage.setItem(storageKey, id);
          } catch {}
        }}
        cardFilter={onlyUnmapped ? unmapped : undefined}
        onFinding={(card, message) => setFinding({ card: card.label, message })}
        toolbarExtra={
          <>
            {toolbarExtra}
            <label className="lineage-check">
              <input
                type="checkbox"
                checked={onlyUnmapped}
                onChange={e => setOnlyUnmapped(e.target.checked)}
              />
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
                {list.map(b => (
                  <li key={b.id}>
                    <span>
                      <small>{b.kind}</small>
                      {b.rootConcept}
                      {b.relationships.length ? '.' + b.relationships.join('.') : ''}
                      {b.expression ? <code>{b.expression}</code> : null}
                    </span>
                    <button
                      onClick={() =>
                        onEditItem?.(b.evidence.documentId, b.evidence.path.slice(0, -1))
                      }
                      disabled={!onEditItem}
                    >
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
          size="small"
          onCancel={() => setFinding(null)}
          footer={
            <>
              {(() => {
                const e = evidenceOf(finding.message);
                return e && onEditItem ? (
                  <button
                    className="primary"
                    onClick={() => {
                      setFinding(null);
                      onEditItem(e.documentId, e.path);
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
export type { MappingGraph };
