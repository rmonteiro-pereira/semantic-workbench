/** The neighborhood canvas controls: centre picker, neighbor counts, pierce, options, and the walk trail. */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { ArrowLeft, ArrowRight, FileSymlink, Gauge, LocateFixed } from 'lucide-react';
import { ScrollStrip } from '../components/ScrollStrip';
import { EntityName } from './EntityName';
import { CompactControls } from './CompactControls';
import { GraphOptions, OptionGroup, ShowToggle } from './GraphOptions';
import { PierceControls } from './PierceControls';
import { ZoomButtons } from './ZoomButtons';
import { FullscreenButton } from './FullGraph';
import type { Fullscreen } from './fullscreen';
import type { Direction } from './expansion';
import type { Entity } from '../../shared/core/model';
import type { Neighborhood } from './graph-view';
import { NEIGHBOR_PAGE } from './graph-view';
import type { Walk } from './walk';
import type { CrossFileTarget } from './NeighborhoodGraph';

type Setter<Value> = (update: Value | ((previous: Value) => Value)) => void;

type CountsProps = {
  centerEntity: Entity | undefined;
  view: Neighborhood;
  limit: number;
  setLimit: Setter<number>;
};

function NeighborCounts({ centerEntity, view, limit, setLimit }: CountsProps) {
  return (
    <>
      <span className="neighborhood-counts" role="status" aria-label="Neighbor counts">
        {centerEntity ? (
          <>
            {view.shown} of {view.total} neighbors
            {view.hidden > 0 && (
              <>
                {' '}
                · <strong>{view.hidden} hidden</strong>
              </>
            )}
          </>
        ) : (
          'No center'
        )}
      </span>
      {view.hidden > 0 && (
        <button onClick={() => setLimit(l => l + NEIGHBOR_PAGE)}>
          {Math.min(NEIGHBOR_PAGE, view.hidden)} more {Math.min(NEIGHBOR_PAGE, view.hidden) === 1 ? 'neighbor' : 'neighbors'}
        </button>
      )}
      {limit > NEIGHBOR_PAGE && <button onClick={() => setLimit(NEIGHBOR_PAGE)}>Fewer</button>}
    </>
  );
}

type PickerProps = {
  centerEntity: Entity | undefined;
  pick: string;
  setPick: Dispatch<SetStateAction<string>>;
  pickOpen: boolean;
  setPickOpen: Dispatch<SetStateAction<boolean>>;
  active: number;
  setActive: Dispatch<SetStateAction<number>>;
  pickResults: Entity[];
  onChoose: (id: string) => void;
};

function CenterPicker({ centerEntity, pick, setPick, pickOpen, setPickOpen, active, setActive, pickResults, onChoose }: PickerProps) {
  return (
    <div className="center-picker" role="combobox" aria-expanded={pickOpen && pickResults.length > 0} aria-haspopup="listbox" aria-owns="center-picker-results">
      <LocateFixed size={14} />
      <input
        aria-label="Find a center"
        aria-controls="center-picker-results"
        aria-autocomplete="list"
        placeholder={centerEntity ? `Center: ${centerEntity.name}` : 'Find a center'}
        value={pick}
        onChange={event => {
          setPick(event.target.value);
          setPickOpen(true);
          setActive(0);
        }}
        onFocus={() => setPickOpen(true)}
        onBlur={() => setTimeout(() => setPickOpen(false), 150)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(i => Math.min(i + 1, pickResults.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(i => Math.max(i - 1, 0));
          } else if (event.key === 'Enter' && pickResults[active]) {
            event.preventDefault();
            onChoose(pickResults[active].id);
          } else if (event.key === 'Escape') {
            setPick('');
            setPickOpen(false);
          }
        }}
      />
      {pickOpen && pickResults.length > 0 && (
        <ul id="center-picker-results" role="listbox" aria-label="Center candidates">
          {pickResults.map((pickResult, i) => (
            <li
              key={pickResult.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={ev => {
                ev.preventDefault();
                onChoose(pickResult.id);
              }}
            >
              <EntityName name={pickResult.name} />
              <small>{pickResult.kind}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type OptionsProps = {
  view: Neighborhood;
  relationship: string;
  setRelationship: Setter<string>;
  lateral: boolean;
  lateralCount: number;
  onLateral: (shown: boolean) => void;
  technical: boolean;
  setTechnical: Setter<boolean>;
  labels: boolean;
  setLabels: Setter<boolean>;
  valueCount: number;
  hideValues: boolean;
  onToggleValueTypes: () => void;
  kpiCount: number;
  hideKpis: boolean;
  setHideKpis: Setter<boolean>;
  onRearrange: () => void;
};

function NeighborhoodOptions({
  view,
  relationship,
  setRelationship,
  lateral,
  lateralCount,
  onLateral,
  technical,
  setTechnical,
  labels,
  setLabels,
  valueCount,
  hideValues,
  onToggleValueTypes,
  kpiCount,
  hideKpis,
  setHideKpis,
  onRearrange,
}: OptionsProps) {
  return (
    <GraphOptions>
      <OptionGroup title="Neighbors">
        {view.relationships.length > 1 && (
          <label>
            Relationship
            <select aria-label="Filter neighbors by relationship" value={relationship} onChange={e => setRelationship(e.target.value)}>
              <option value="">All ({view.relationships.reduce((n, r) => n + r.count, 0)})</option>
              {view.relationships.map(relationship => (
                <option key={relationship.label} value={relationship.label}>
                  {relationship.label} ({relationship.count})
                </option>
              ))}
            </select>
          </label>
        )}
        <ShowToggle on={lateral} onToggle={() => onLateral(!lateral)} title="Relationships among the visible neighbors">
          Links between neighbors ({lateralCount})
        </ShowToggle>
        {view.technicalHidden > 0 || technical ? (
          <ShowToggle on={technical} onToggle={() => setTechnical(shown => !shown)} title="OWL properties, restrictions and other RDF resources">
            Technical resources{technical ? '' : ` (${view.technicalHidden})`}
          </ShowToggle>
        ) : null}
      </OptionGroup>
      <OptionGroup title="Show">
        <ShowToggle on={labels} onToggle={() => setLabels(shown => !shown)}>
          Labels
        </ShowToggle>
        {valueCount > 0 && (
          <ShowToggle on={!hideValues} onToggle={onToggleValueTypes} title={`${valueCount} value types and built-in concepts`}>
            Value types
          </ShowToggle>
        )}
        {kpiCount > 0 && (
          <ShowToggle on={!hideKpis} onToggle={() => setHideKpis(hidden => !hidden)} title={`${kpiCount} metric nodes`}>
            Metrics
          </ShowToggle>
        )}
      </OptionGroup>
      <OptionGroup title="Layout">
        <button onClick={onRearrange} title="Put every node back in its column">
          Re-arrange
        </button>
      </OptionGroup>
    </GraphOptions>
  );
}

type ToolsProps = {
  picker: PickerProps;
  counts: CountsProps;
  compact: boolean;
  direction: Direction;
  onDirection: (direction: Direction) => void;
  pierceRunning: boolean;
  onPierce: () => void;
  onStopPierce: () => void;
  canUndo: boolean;
  onUndo: () => void;
  pierceOrigin: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  options: OptionsProps;
  fullscreen?: Fullscreen;
};

export function NeighborhoodTools({
  picker,
  counts,
  compact,
  direction,
  onDirection,
  pierceRunning,
  onPierce,
  onStopPierce,
  canUndo,
  onUndo,
  pierceOrigin,
  onZoomIn,
  onZoomOut,
  options,
  fullscreen,
}: ToolsProps) {
  const { lateral } = options;
  return (
    <ScrollStrip className="neighborhood-tools">
      <CenterPicker {...picker} />
      {!compact && <NeighborCounts {...counts} />}
      <CompactControls>
        <PierceControls
          direction={direction}
          onDirection={onDirection}
          running={pierceRunning}
          onPierce={onPierce}
          onStop={onStopPierce}
          canUndo={canUndo}
          onUndo={onUndo}
          title={`Expand everything reachable from ${pierceOrigin}`}
        />
        <ZoomButtons onZoomIn={onZoomIn} onZoomOut={onZoomOut} />
        <NeighborhoodOptions {...options} />
        {fullscreen && <FullscreenButton fullscreen={fullscreen} />}
        <span className="neighborhood-legend" aria-hidden="true">
          <span className="in">Incoming</span>
          <span className="out">Outgoing</span>
          {lateral && <span className="lateral">Between neighbors</span>}
        </span>
      </CompactControls>
    </ScrollStrip>
  );
}

type LinksProps = {
  compact: boolean;
  counts: CountsProps;
  actionHistory: { canBack: boolean; canForward: boolean; back: () => void; forward: () => void };
  trail: RefObject<HTMLOListElement | null>;
  walk: Walk;
  docId: string;
  docLabel: (doc: string) => string;
  offTrail: boolean;
  centerEntity: Entity | undefined;
  onWalkTo: (index: number) => void;
  cross: CrossFileTarget[];
  onCrossFile?: (target: CrossFileTarget) => void;
  kpiFor: string[];
  onOpenKpis?: (concept: string) => void;
};

export function NeighborhoodLinks({ compact, counts, actionHistory, trail, walk, docId, docLabel, offTrail, centerEntity, onWalkTo, cross, onCrossFile, kpiFor, onOpenKpis }: LinksProps) {
  return (
    <div className="neighborhood-links">
      {compact && <NeighborCounts {...counts} />}
      <nav className="walk-trail" aria-label="Walk">
        <button aria-label="Back" title="Back" disabled={!actionHistory.canBack} onClick={actionHistory.back}>
          <ArrowLeft size={14} />
        </button>
        <button aria-label="Forward" title="Forward" disabled={!actionHistory.canForward} onClick={actionHistory.forward}>
          <ArrowRight size={14} />
        </button>
        <ol ref={trail}>
          {walk.steps.map((step, i) => (
            <li key={i}>
              {step.via && (
                <span className="via" title={`through ${step.via.label}`}>
                  {step.via.label} →
                </span>
              )}
              <button aria-current={i === walk.index && !offTrail ? 'step' : undefined} onClick={() => onWalkTo(i)} title={step.doc === docId ? step.name : `${step.name} in ${docLabel(step.doc)}`}>
                {step.name}
                {step.doc !== docId && <small> · {docLabel(step.doc)}</small>}
              </button>
            </li>
          ))}
          {offTrail && centerEntity && (
            <li>
              <button aria-current="step" title="Current center">
                {centerEntity.name}
              </button>
            </li>
          )}
        </ol>
      </nav>
      {cross.length > 0 && (
        <CompactControls label="Other files">
          {cross.map(crossFileTarget => (
            <button key={crossFileTarget.doc + crossFileTarget.entity} onClick={() => onCrossFile?.(crossFileTarget)} title={crossFileTarget.reason}>
              <FileSymlink size={13} />
              Continue in <strong>{crossFileTarget.file}</strong> · {crossFileTarget.name}
            </button>
          ))}
        </CompactControls>
      )}
      {kpiFor.length > 0 && centerEntity && (
        <button onClick={() => onOpenKpis?.(centerEntity.name)}>
          <Gauge size={13} />
          {kpiFor.length} metric{kpiFor.length === 1 ? '' : 's'} for {centerEntity.name}
        </button>
      )}
    </div>
  );
}
