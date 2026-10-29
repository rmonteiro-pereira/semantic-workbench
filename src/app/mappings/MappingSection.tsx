/** One mapping of the Mappings tab: its heading, the four connected layers, and the concepts with their detail. */
import { Code } from 'lucide-react';
import React, { useMemo } from 'react';
import type { Finding, RuntimeContext } from '../../server/agent/runtime';
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import { ConceptDetail } from './ConceptDetail';
import { ConceptList } from './ConceptList';
import { QueryComposer } from './QueryComposer';
import { CONCEPTS_SHOWN, DATASETS_SHOWN } from './list-window';
import { boundFields, boundMetrics, conceptRows, firstConceptToShow, layerCells } from './mapping-view';
import { useConceptContext } from './useConceptContext';
import { useQueryComposer } from './useQueryComposer';

type Props = {
  context: RuntimeContext;
  mappingFile: string;
  project: string;
  projectName: string;
  /** The name of the open file; empty when the mapping is the open file itself. */
  openFileName: string;
  dataContractFiles: string[];
  revisionKey: string;
  dirty: boolean;
  onEditItem?: (docId: string, path: (string | number)[]) => void;
  onOpenSource?: (documentId: string) => void;
};

function Layers({ context, dataContractFiles }: { context: RuntimeContext; dataContractFiles: string[] }) {
  return (
    <div className="mapping-layers">
      {layerCells(context, dataContractFiles).map(cell => (
        <div className="mapping-layer" key={cell.layer}>
          <span className="mapping-layer-label">{cell.layer}</span>
          <span>{cell.name}</span>
          <span className="mapping-layer-file">{[cell.count, cell.file].filter(Boolean).join(' · ')}</span>
        </div>
      ))}
    </div>
  );
}

function Findings({ findings, onEditItem }: { findings: Finding[]; onEditItem?: Props['onEditItem'] }) {
  if (findings.length === 0) return null;
  return (
    <div className="mapping-findings">
      {findings.map((finding, index) => {
        const evidence = finding.evidence;
        return (
          <p key={index} className={finding.severity === 'error' ? 'mapping-error' : 'mapping-notice'}>
            {finding.message}
            {evidence?.path.length ? (
              <button type="button" onClick={() => onEditItem?.(evidence.documentId, evidence.path)} disabled={!onEditItem}>
                Edit item
              </button>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}

/** Saves the whole mapping context, and marks the concept the page shows and the bindings the agent API returns for it. */
function downloadAgentContext(context: RuntimeContext, concept: string, selected: RuntimeContext) {
  const data = { ...context, selectedConcept: concept || null, selectedBindings: selected.bindings };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agent-context.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Shows one resolved mapping. The selected concept's cards come from what the agent API returns for it. */
export function MappingSection({ context, mappingFile, project, projectName, openFileName, dataContractFiles, revisionKey, dirty, onEditItem, onOpenSource }: Props) {
  const stateKey = context.mappingId;
  const [chosenConcept, setConcept] = useRecordedState<string | null>(`mappings.concept:${stateKey}`, null);
  const [searchText, setSearchText] = useRecordedState(`mappings.search:${stateKey}`, '');
  const [conceptLimit, setConceptLimit] = useRecordedState(`mappings.conceptLimit:${stateKey}`, CONCEPTS_SHOWN);
  const [datasetLimit, setDatasetLimit] = useRecordedState(`mappings.datasetLimit:${stateKey}`, DATASETS_SHOWN);
  const [composing, setComposing] = useRecordedState(`mappings.composing:${stateKey}`, false);
  const allRows = useMemo(() => conceptRows(context, ''), [context]);
  const rows = useMemo(() => conceptRows(context, searchText), [context, searchText]);
  const concept = chosenConcept ?? firstConceptToShow(allRows);
  const selected = useConceptContext(project, context.mappingId, concept, context, revisionKey);
  const composer = useQueryComposer(project, context.mappingId, concept);

  function selectConcept(name: string) {
    setConcept(name);
    setDatasetLimit(DATASETS_SHOWN);
    composer.reset();
  }

  const description = `The mapping of the ${projectName} project${openFileName ? ` for ${openFileName}` : ''} · ${mappingFile}`;
  const hasErrors = context.findings.some(finding => finding.severity === 'error');
  return (
    <section className="mapping-page" aria-label={context.name}>
      <div className="mapping-top">
        <div>
          <h2>{context.name}</h2>
          <p>{description}</p>
        </div>
        <div className="mapping-actions">
          <button onClick={() => setComposing(true)}>
            <Code size={16} aria-hidden="true" />
            Show query
          </button>
          <button onClick={() => selected.context && downloadAgentContext(context, concept, selected.context)} disabled={!selected.context}>
            Export agent context
          </button>
        </div>
      </div>
      {dirty && <p className="mapping-notice">This view uses saved document revisions. Save your changes to update the runtime context.</p>}
      {composing && selected.context && (
        <QueryComposer
          governed={boundMetrics(selected.context, concept)}
          fields={boundFields(selected.context, concept)}
          metrics={composer.metrics}
          dimensions={composer.dimensions}
          onToggleMetric={composer.toggleMetric}
          onToggleDimension={composer.toggleDimension}
          canPreview={!composer.loading && (composer.metrics.length > 0 || composer.dimensions.length > 0) && !hasErrors}
          loading={composer.loading}
          plan={composer.plan}
          error={composer.error}
          onPreview={() => void composer.preview()}
          onClose={() => setComposing(false)}
          onOpenSource={onOpenSource ? () => onOpenSource(context.mappingId.split('#')[0]) : undefined}
        />
      )}
      <Layers context={context} dataContractFiles={dataContractFiles} />
      <Findings findings={context.findings} onEditItem={onEditItem} />
      <div className="mapping-columns">
        <ConceptList
          rows={rows}
          totalBindings={context.bindings.length}
          selected={concept}
          searchText={searchText}
          limit={conceptLimit}
          onSearch={setSearchText}
          onSelect={selectConcept}
          onLimit={setConceptLimit}
        />
        {selected.context && <ConceptDetail context={selected.context} concept={concept} datasetLimit={datasetLimit} onDatasetLimit={setDatasetLimit} />}
        {!selected.context && !selected.error && <p role="status">Resolving saved layers</p>}
        {selected.error && (
          <p role="alert" className="mapping-error">
            {selected.error}
          </p>
        )}
      </div>
    </section>
  );
}
