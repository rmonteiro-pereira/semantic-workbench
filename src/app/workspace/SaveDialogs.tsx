/** Presentation and event handling for save dialogs. */
import React from 'react';
import { useGitSetup } from '../scm/GitSetup';
import { looksLikeAuthFailure } from '../scm/CredentialGuide';
import type { KpiSummary } from '../../server/agent/explain';
import { MetricWizard } from '../metrics/MetricWizard';
import type { Doc, ProjectInfo } from '../projects/api';
import type { AutosaveState } from '../projects/autosave';
import { CommitDialog } from '../scm/CommitDialog';

type Props = {
  wizard: boolean | KpiSummary;
  kpiProject: string | null;
  docs: Doc[];
  kpis: KpiSummary[];
  setWizard: React.Dispatch<React.SetStateAction<boolean | KpiSummary>>;
  setSelectedKpi: React.Dispatch<React.SetStateAction<string>>;
  setTab: (next: string) => void;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  refresh: () => Promise<Doc[]>;
  committing: boolean;
  current: Doc | null;
  projects: ProjectInfo[];
  itemHints: React.RefObject<Record<string, Record<string, string>>>;
  source: string;
  setCommitting: React.Dispatch<React.SetStateAction<boolean>>;
  setGitVersion: React.Dispatch<React.SetStateAction<number>>;
  setTrashVersion: React.Dispatch<React.SetStateAction<number>>;
  currentRef: React.RefObject<Doc | null>;
  autosave: {
    state: AutosaveState;
    flush(): Promise<void>;
    resolved: (hash: string | null, text: string) => void;
    cancel: () => void;
  };
  setCurrent: (next: Doc | null) => void;
  setSource: React.Dispatch<React.SetStateAction<string>>;
};
/** Renders save dialogs. */
export function SaveDialogs({
  wizard,
  kpiProject,
  docs,
  kpis,
  setWizard,
  setSelectedKpi,
  setTab,
  setMessage,
  refresh,
  committing,
  current,
  projects,
  itemHints,
  source,
  setCommitting,
  setGitVersion,
  setTrashVersion,
  currentRef,
  autosave,
  setCurrent,
  setSource,
}: Props) {
  const openGitSetup = useGitSetup();
  function handleMetricWizardSaved(file: string, modelPath: import('../../shared/edit/item-model').Path, name: string) {
    const added = typeof wizard === 'object';
    setWizard(false);
    setSelectedKpi(`${file}#${modelPath.join('/')}#${name}`);
    setTab('metrics');
    setMessage(added ? `Added attributes to metric ${name} in ${file}.` : `Created metric ${name} in ${file}.`);
    void refresh().catch(() => {});
  }

  function handleCommitDialogCommitted(r: import('../scm/CommitDialog').CommitOutcome) {
    function getPushOutcome() {
      if (r.pushed) {
        if (r.pushed.ok) {
          return ' and pushed.';
        }
        const guide = looksLikeAuthFailure(r.pushed.message) ? ' Source control offers a Credential setup guide.' : '';
        return `; push failed: ${r.pushed.message}${guide}`;
      }
      return '.';
    }

    if (current == null) return;

    setCommitting(false);
    itemHints.current[current.project] = {};
    const commit = r.commit.slice(0, 7);
    const fileCount = r.files.length;
    setMessage(`Committed ${commit} (${fileCount} file${fileCount === 1 ? '' : 's'})${getPushOutcome()}`);
    setGitVersion(v => v + 1);
    void refresh().catch(() => {});
  }

  function handleCommitDialogReverted(path: string, hash: string | null) {
    if (current == null) return;

    setMessage(hash ? `Reverted ${path} to the last commit; the replaced version is in the trash.` : `Moved ${path} to the trash.`);
    setTrashVersion(v => v + 1);
    void refresh()
      .then(d => {
        const doc = d.find(x => x.project === current.project && x.path === path);
        if (doc && currentRef.current?.project === current.project && currentRef.current.path === path) {
          autosave.resolved(doc.hash, doc.source);
          setCurrent(doc);
          setSource(doc.source);
        }
      })
      .catch(() => {});
  }

  return (
    <>
      {wizard && kpiProject && (
        <MetricWizard
          project={kpiProject}
          docs={docs.filter(d => d.project === kpiProject)}
          kpis={kpis}
          existing={typeof wizard === 'object' ? wizard : undefined}
          onClose={() => setWizard(false)}
          onSaved={handleMetricWizardSaved}
        />
      )}
      {committing && current && (
        <CommitDialog
          project={current.project}
          projectName={projects.find(p => p.slug === current.project)?.name}
          itemHints={itemHints.current[current.project]}
          unsaved={source !== current.source ? [current.path] : []}
          onClose={() => setCommitting(false)}
          onCommitted={handleCommitDialogCommitted}
          onReverted={handleCommitDialogReverted}
          onSetIdentity={() => openGitSetup({ kind: 'identity', project: current.project })}
        />
      )}
    </>
  );
}
