/** Presentation and event handling for metrics panel. */
import React, { useMemo, useState } from 'react';
import type { KpiSummary } from '../../server/agent/explain';
import { MetricsView } from '../metrics/MetricsView';
import type { ProjectInfo } from '../projects/api';
import { TrafficSort } from '../usage/TrafficSort';
import { sortByTraffic } from '../usage/usage-sort';
import { useMetricTotals, useTraffic } from '../usage/use-usage';

type Props = {
  kpiProject: string | null;
  projects: ProjectInfo[];
  kpis: KpiSummary[];
  kpiError: string;
  kpiLoading: boolean;
  selectedKpi: string;
  setSelectedKpi: React.Dispatch<React.SetStateAction<string>>;
  kpiFilter: string;
  setWizard: React.Dispatch<React.SetStateAction<boolean | KpiSummary>>;
  editKpi: (kpiSummary: KpiSummary) => void;
};
/** Renders metrics panel. */
export function MetricsPanel({ kpiProject, projects, kpis, kpiError, kpiLoading, selectedKpi, setSelectedKpi, kpiFilter, setWizard, editKpi }: Props) {
  // Sorting by traffic exists only while Traffic is on; the list keeps its own order otherwise.
  const [sortedByTraffic, setSortedByTraffic] = useState(false);
  const trafficOn = useTraffic().on;
  const totalOf = useMetricTotals(kpiProject);
  const ordered = useMemo(() => (trafficOn && sortedByTraffic ? sortByTraffic(kpis, totalOf) : kpis), [kpis, trafficOn, sortedByTraffic, totalOf]);
  return (
    <>
      <TrafficSort sorted={sortedByTraffic} onToggle={() => setSortedByTraffic(sorted => !sorted)} />
      <MetricsView
        project={kpiProject}
        projectName={projects.find(p => p.slug === kpiProject)?.name}
        kpis={ordered}
        error={kpiError}
        loading={kpiLoading}
        selected={selectedKpi}
        onSelect={setSelectedKpi}
        filter={kpiFilter}
        onNew={() => setWizard(true)}
        onEdit={editKpi}
        onAddAttributes={k => setWizard(k)}
      />
    </>
  );
}
