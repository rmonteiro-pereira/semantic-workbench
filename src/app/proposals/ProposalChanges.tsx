// The files a proposal changes in each project the person may read, and the text comparison of the
// one they pick, using the same comparison view as Source Control.
import { useEffect, useState } from 'react';
import { DiffView } from '../scm/DiffView';
import type { ProposalChange } from '../../shared/proposals/proposal';
import { proposals, type ProposalFileDiff } from './api';
import { fileCount, problemText } from './proposal-wording';

const STATUS_WORD = { added: 'Added', changed: 'Changed', removed: 'Removed' } as const;

type Chosen = { project: string; path: string };

/** Lists changed files per project and shows the comparison of the chosen file. */
export function ProposalChanges({ project, id, changes, projectName }: { project: string; id: string; changes: ProposalChange[]; projectName: (slug: string) => string }) {
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [diff, setDiff] = useState<ProposalFileDiff | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    setDiff(null);
    setFailure(null);
    if (!chosen) return;
    let current = true;
    proposals
      .diff(project, id, chosen.project, chosen.path)
      .then(next => current && setDiff(next))
      .catch(problem => current && setFailure(problemText(problem)));
    return () => {
      current = false;
    };
  }, [project, id, chosen]);
  if (!changes.length) return <p className="scm-empty">No files differ from the published version yet.</p>;
  return (
    <div className="proposal-changes">
      {changes.map(group => (
        <section key={group.project} aria-label={`Changes in ${projectName(group.project)}`}>
          <h4>
            {projectName(group.project)} <small>{fileCount(group.files.length)}</small>
          </h4>
          <ul>
            {group.files.map(file => {
              const selected = chosen?.project === group.project && chosen.path === file.path;
              return (
                <li key={file.path}>
                  <button className={`proposal-file${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={() => setChosen({ project: group.project, path: file.path })}>
                    <span>{file.path}</span>
                    <small>{STATUS_WORD[file.status]}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {failure && (
        <p role="alert" className="scm-note warning">
          {failure}
        </p>
      )}
      {chosen && !diff && !failure && <p className="scm-empty">Loading the comparison…</p>}
      {diff?.binary && <p className="scm-empty">This file is not text, so there is nothing to compare.</p>}
      {diff && !diff.binary && (
        <DiffView
          before={diff.before}
          after={diff.after}
          filename={diff.path}
          beforeLabel="Published version"
          afterLabel="This proposal"
          label={`Comparison of ${diff.path}`}
          newFile={!diff.beforeExists}
        />
      )}
    </div>
  );
}
