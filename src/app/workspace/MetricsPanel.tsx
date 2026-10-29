/** Presentation and event handling for metrics panel. */
import React from 'react';
import type { KpiSummary } from '../../server/agent/explain';
import { MetricsView } from '../metrics/MetricsView';
import type { ProjectInfo } from '../projects/api';

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
  editKpi: (k: KpiSummary) => void;
};
/** Renders metrics panel. */
export function MetricsPanel({ kpiProject, projects, kpis, kpiError, kpiLoading, selectedKpi, setSelectedKpi, kpiFilter, setWizard, editKpi }: Props) {
  return (
    <MetricsView
      project={kpiProject}
      projectName={projects.find(p => p.slug === kpiProject)?.name}
      kpis={kpis}
      error={kpiError}
      loading={kpiLoading}
      selected={selectedKpi}
      onSelect={setSelectedKpi}
      filter={kpiFilter}
      onNew={() => setWizard(true)}
      onEdit={editKpi}
      onAddAttributes={k => setWizard(k)}
    />
  );
}
