/** The lineage canvas controls: asset search, Fit, pierce, view options, zoom, full screen and the walk trail. */
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Maximize2, Minimize2, Scan, Search } from 'lucide-react';
import { PierceControls } from '../graph/PierceControls';
import { CompactControls } from '../graph/CompactControls';
import { GraphOptions, OptionGroup, ShowToggle } from '../graph/GraphOptions';
import { ZoomButtons } from '../graph/ZoomButtons';
import type { Fullscreen } from '../graph/fullscreen';
import type { Direction } from '../graph/expansion';
import type { Walk, WalkAction } from '../graph/walk';
import type { AssetHitKind, findAssets, ForeignKeyPath } from './lineage';
import { ForeignKeyHops } from './ForeignKeyHops';

const ASSET_KIND_LABEL: Record<AssetHitKind, string> = {
  field: 'Field',
  column: 'Column',
  relationship: 'Relationship',
  object: 'Table',
  dataset: 'Dataset',
  metric: 'Metric',
  concept: 'Concept',
  external: 'External',
};

type AssetHits = ReturnType<typeof findAssets>;

type SearchProps = {
  query: string;
  onQuery: (query: string) => void;
  showResults: boolean;
  onShowResults: (show: boolean) => void;
  results: AssetHits;
  onChoose: (hit: AssetHits[number]) => void;
};

function LineageSearch({ query, onQuery, showResults, onShowResults, results, onChoose }: SearchProps) {
  return (
    <div className="lineage-search" role="combobox" aria-expanded={showResults && results.length > 0} aria-haspopup="listbox" aria-owns="lineage-asset-results">
      <Search size={14} />
      <input
        aria-label="Find assets"
        placeholder="Find assets…"
        value={query}
        aria-autocomplete="list"
        aria-controls="lineage-asset-results"
        onFocus={() => onShowResults(true)}
        onBlur={() => setTimeout(() => onShowResults(false), 150)}
        onChange={e => {
          onQuery(e.target.value);
          onShowResults(true);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && results[0]) {
            event.preventDefault();
            onChoose(results[0]);
          }
          if (event.key === 'Escape') {
            onQuery('');
            onShowResults(false);
          }
        }}
      />
      {showResults && query && (
        <ul id="lineage-asset-results" role="listbox" aria-label="Asset results">
          {results.length ? (
            results.map(hit => (
              <li
                key={hit.id}
                role="option"
                aria-selected={false}
                onMouseDown={e => {
                  e.preventDefault();
                  onChoose(hit);
                }}
              >
                <span className={`asset-kind k-${hit.kind}`}>{ASSET_KIND_LABEL[hit.kind]}</span>
                <span className="asset-name">{hit.label}</span>
              </li>
            ))
          ) : (
            <li role="option" aria-disabled="true" aria-selected={false} className="none">
              No asset matches “{query}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

type ViewOptionsProps = {
  mapping: boolean;
  centreName: string;
  steps: number;
  onSteps: (count: number) => void;
  showMetrics: boolean;
  onToggleMetrics: () => void;
  showExternal: boolean;
  onToggleExternal: () => void;
};

function LineageViewOptions({ mapping, centreName, steps, onSteps, showMetrics, onToggleMetrics, showExternal, onToggleExternal }: ViewOptionsProps) {
  return (
    <GraphOptions
      title="View options"
      intro={
        mapping
          ? `The view shows ${centreName} and every card within the chosen number of mapping lines of it.`
          : `The view shows ${centreName} with every field and metric that reads it, and tables up to the chosen number of foreign-key hops away.`
      }
    >
      {mapping && (
        <OptionGroup title="Steps">
          <label>
            Steps
            <select aria-label="Mapping steps" value={steps} onChange={e => onSteps(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map(stepCount => (
                <option key={stepCount} value={stepCount}>
                  {stepCount}
                </option>
              ))}
            </select>
          </label>
        </OptionGroup>
      )}
      <OptionGroup title="Show">
        <ShowToggle on={showMetrics} onToggle={onToggleMetrics} title="Metrics that read the shown columns">
          Metrics
        </ShowToggle>
        {!mapping && (
          <ShowToggle on={showExternal} onToggle={onToggleExternal} title="Tables in other contracts that these columns refer to">
            Other contracts
          </ShowToggle>
        )}
      </OptionGroup>
    </GraphOptions>
  );
}

type ToolbarProps = ViewOptionsProps &
  SearchProps & {
    onFit: () => void;
    direction: Direction;
    onDirection: (direction: Direction) => void;
    piercing: boolean;
    onPierce: () => void;
    onStopPierce: () => void;
    canUndo: boolean;
    onUndo: () => void;
    pierceTitle: string;
    toolbarExtra?: ReactNode;
    fullscreen?: Fullscreen;
    onZoomIn: () => void;
    onZoomOut: () => void;
  };

export function LineageToolbar(props: ToolbarProps) {
  const { fullscreen } = props;
  return (
    <div className="lineage-toolbar">
      <LineageSearch query={props.query} onQuery={props.onQuery} showResults={props.showResults} onShowResults={props.onShowResults} results={props.results} onChoose={props.onChoose} />
      <button onClick={props.onFit} aria-label="Fit" title="Fit the graph">
        <Scan size={14} />
        <span className="tool-label">Fit</span>
      </button>
      <CompactControls>
        <PierceControls
          direction={props.direction}
          onDirection={props.onDirection}
          running={props.piercing}
          onPierce={props.onPierce}
          onStop={props.onStopPierce}
          canUndo={props.canUndo}
          onUndo={props.onUndo}
          title={props.pierceTitle}
        />
        {props.toolbarExtra}
        <span className="lineage-toolbar-spacer" />
        <LineageViewOptions
          mapping={props.mapping}
          centreName={props.centreName}
          steps={props.steps}
          onSteps={props.onSteps}
          showMetrics={props.showMetrics}
          onToggleMetrics={props.onToggleMetrics}
          showExternal={props.showExternal}
          onToggleExternal={props.onToggleExternal}
        />
        <ZoomButtons onZoomIn={props.onZoomIn} onZoomOut={props.onZoomOut} />
        {fullscreen && (
          <button onClick={fullscreen.toggle} aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'} title="Full screen (F)">
            {fullscreen.active ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </CompactControls>
    </div>
  );
}

type TrailProps = {
  foreignKeys: ForeignKeyPath | null;
  steps: number;
  onHops: (count: number) => void;
  actionHistory: { canBack: boolean; canForward: boolean; back: () => void; forward: () => void };
  walk: Walk;
  dispatch: (action: WalkAction) => void;
  showPathToggle: boolean;
  pathCount: number;
  onOpenPath: () => void;
};

export function LineageSubbar({ foreignKeys, steps, onHops, actionHistory, walk, dispatch, showPathToggle, pathCount, onOpenPath }: TrailProps) {
  return (
    <div className="lineage-subbar">
      {foreignKeys && <ForeignKeyHops path={foreignKeys} hops={steps} onHops={onHops} />}
      <div className="lineage-trail" aria-label="Walk">
        <button aria-label="Back" disabled={!actionHistory.canBack} onClick={actionHistory.back}>
          <ArrowLeft size={13} />
        </button>
        <button aria-label="Forward" disabled={!actionHistory.canForward} onClick={actionHistory.forward}>
          <ArrowRight size={13} />
        </button>
        <ol>
          {walk.steps.map((step, i) => (
            <li key={i}>
              <button aria-current={i === walk.index ? 'step' : undefined} onClick={() => dispatch({ type: 'jump', index: i })} title={step.via ? `via ${step.via.label}` : undefined}>
                {step.via && <small>via {step.via.label} →</small>}
                {step.name}
              </button>
            </li>
          ))}
        </ol>
        {showPathToggle && (
          <button className="lineage-path-toggle" onClick={() => onOpenPath()}>
            Selected path <span>{pathCount}</span>
          </button>
        )}
      </div>
    </div>
  );
}
