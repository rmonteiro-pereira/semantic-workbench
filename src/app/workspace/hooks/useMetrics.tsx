/** Loads project metrics and maintains metric selection, filters, and concept badges. */
import { useRecordedState } from './useRecordedState';
import { useEffect, useMemo, useState } from 'react';
import type { KpiSummary } from '../../../server/agent/explain';
import { projectRevisionKey } from '../../../shared/core/selected-project';
import type { Doc } from '../../projects/api';
import { api } from '../../projects/api';

type Options = { project: string; docs: Doc[] };
/** Manages metrics. */
export function useMetrics({ project, docs }: Options) {
  // Metrics of the selected project, for the Metrics tab and the metric badges on concepts.
  const [kpis, setKpis] = useState<KpiSummary[]>([]);
  const [kpiError, setKpiError] = useState('');
  const [kpiLoading, setKpiLoading] = useState(false);
  const [selectedKpi, setSelectedKpi] = useRecordedState('metrics.selected', '');
  const [kpiFilter, setKpiFilter] = useState('');
  const kpiProject = project || null;
  const kpiRevision = projectRevisionKey(docs, project);
  useEffect(() => {
    if (!kpiProject) {
      setKpis([]);
      return;
    }
    let live = true;
    setKpiLoading(true);
    api
      .metrics(kpiProject)
      .then(k => {
        if (live) {
          setKpis(k);
          setKpiError('');
        }
      })
      .catch(e => {
        if (live) {
          setKpis([]);
          setKpiError(e.message);
        }
      })
      .finally(() => {
        if (live) setKpiLoading(false);
      });
    return () => {
      live = false;
    };
  }, [kpiProject, kpiRevision]);
  useEffect(() => setSelectedKpi(''), [kpiProject]);
  const kpiBadges = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const metric of kpis)
      for (const conceptValue of metric.concepts) {
        const name = conceptValue.concept ?? conceptValue.input;
        const list = map.get(name) ?? [];
        if (!list.includes(metric.label)) list.push(metric.label);
        map.set(name, list);
      }
    return map;
  }, [kpis]);

  return {
    kpiProject,
    kpis,
    setSelectedKpi,
    kpiError,
    kpiLoading,
    selectedKpi,
    kpiFilter,
    kpiBadges,
    setKpiFilter,
  };
}
