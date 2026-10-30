/** The right column of the Mappings tab: what the ontology, the mapping and the agent API say about one concept. */
import type { SelectedContext } from '../../server/agent/runtime';
import { ShowMoreControl } from './ShowMoreControl';
import { DATASETS_SHOWN, DATASETS_STEP, showMoreDatasetsLabel, visibleCount } from './list-window';
import { DatasetBindings } from './DatasetBindings';
import { datasetLineages } from './binding-lineage';
import { agentContextLines, boundMetrics, conceptSummary } from './mapping-view';

type Props = {
  /** What the agent API returned for the concept; for All concepts, the whole mapping. */
  context: SelectedContext;
  concept: string;
  datasetLimit: number;
  onDatasetLimit: (limit: number) => void;
  /** The datasets whose bindings are all shown. */
  expandedDatasets: string[];
  onExpandedDatasets: (datasets: string[]) => void;
  onOpenSourceAt?: (documentId: string, path: (string | number)[]) => void;
};

function Card({ children }: { children: React.ReactNode }) {
  return <div className="mapping-card">{children}</div>;
}

function datasetCountText(bindings: number, datasets: number) {
  const bindingText = `${bindings} ${bindings === 1 ? 'binding' : 'bindings'}`;
  return `${bindingText} in ${datasets} ${datasets === 1 ? 'dataset' : 'datasets'}`;
}

function withDataset(datasets: string[], dataset: string, included: boolean) {
  const others = datasets.filter(name => name !== dataset);
  return included ? [...others, dataset] : others;
}

/** Shows the concept's definition, where it lives, its metrics, and what an agent receives for it. */
export function ConceptDetail({ context, concept, datasetLimit, onDatasetLimit, expandedDatasets, onExpandedDatasets, onOpenSourceAt }: Props) {
  const summary = conceptSummary(context, concept);
  const subject = concept || 'all concepts';
  const lineages = datasetLineages(context);
  const shown = visibleCount(datasetLimit, lineages.length);
  const metrics = boundMetrics(context).map(metric => metric.name);
  return (
    <div className="mapping-detail">
      <Card>
        <h3>
          {summary.name}
          <span>{summary.subtitle}</span>
        </h3>
        <div className="mapping-definition">{summary.definition}</div>
      </Card>
      <Card>
        <h3>
          Where {subject} lives
          <span>{datasetCountText(context.bindings.length, lineages.length)}</span>
        </h3>
        {lineages.length === 0 && <p className="mapping-note">No binding of {subject} reaches a dataset field yet.</p>}
        {lineages.slice(0, shown).map(lineage => (
          <DatasetBindings
            key={lineage.dataset}
            lineage={lineage}
            expanded={expandedDatasets.includes(lineage.dataset)}
            onExpandedChange={expanded => onExpandedDatasets(withDataset(expandedDatasets, lineage.dataset, expanded))}
            onOpenSourceAt={onOpenSourceAt}
          />
        ))}
        <ShowMoreControl
          showMoreLabel={lineages.length > shown ? showMoreDatasetsLabel(lineages.length - shown) : ''}
          expanded={shown > DATASETS_SHOWN}
          onShowMore={() => onDatasetLimit(shown + DATASETS_STEP)}
          onShowFewer={() => onDatasetLimit(DATASETS_SHOWN)}
        />
      </Card>
      <Card>
        <h3>
          Metrics bound to {subject}
          <span>{metrics.length}</span>
        </h3>
        {metrics.length === 0 && <p className="mapping-note">No governed metric is bound to {subject}.</p>}
        <div className="mapping-chips">
          {metrics.map(name => (
            <span className="mapping-chip" key={name}>
              {name}
            </span>
          ))}
        </div>
      </Card>
      <Card>
        <h3>
          AI context
          <span>what an agent receives for {subject}</span>
        </h3>
        <div className="mapping-ai">
          {agentContextLines(context, concept).map(line => (
            <div key={line.label}>
              <span className="mapping-ai-label">{line.label}</span>
              {line.text}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
