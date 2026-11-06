/** The main pane of Source Control: the diff of the selected change, or two versions of the file whose history is open. */
import type { ReactNode } from 'react';
import { EmptyState } from '../projects/EmptyState';
import type { GitCommit as Commit, GitDiff } from '../projects/api';
import { DiffView } from './DiffView';
import type { Selection } from './ChangeGroup';

type VersionRange = { from: string; to: string };

type DiffPaneProps = {
  selected: Selection;
  diff: GitDiff | null;
  historyFile: string | undefined;
  range: VersionRange | null;
  onRange: (range: VersionRange) => void;
  versions: GitDiff | null;
  log: Commit[];
};

export function DiffPane({ selected, diff, historyFile, range, onRange, versions, log }: DiffPaneProps): ReactNode {
  let mainPane: ReactNode;
  if (selected && diff) {
    if (diff.binary) {
      mainPane = <p className="scm-empty">{diff.path} is a binary file; it can be staged and committed, but not shown.</p>;
    } else {
      mainPane = (
        <DiffView
          label={`Changes in ${diff.path}`}
          filename={diff.path}
          before={diff.before}
          after={diff.after}
          beforeLabel={`${diff.path} · ${diff.beforeExists ? versionName(diff.from) : 'new file'}`}
          afterLabel={diff.afterExists ? versionName(diff.to) : 'Deleted'}
        />
      );
    }
  } else if (historyFile && range && versions) {
    mainPane = (
      <>
        <div className="scm-versions" role="group" aria-label="Compare versions">
          <label>
            <span>From</span>
            <select aria-label="From version" value={range.from} onChange={e => onRange({ ...range, from: e.target.value })}>
              {log.map(gitCommit => (
                <option key={gitCommit.commit} value={gitCommit.commit}>
                  {gitCommit.commit.slice(0, 7)} {gitCommit.message}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>To</span>
            <select aria-label="To version" value={range.to} onChange={e => onRange({ ...range, to: e.target.value })}>
              <option value="worktree">Working tree</option>
              {log.map(gitCommit => (
                <option key={gitCommit.commit} value={gitCommit.commit}>
                  {gitCommit.commit.slice(0, 7)} {gitCommit.message}
                </option>
              ))}
            </select>
          </label>
        </div>
        {versions.binary ? (
          <p className="scm-empty">Binary file.</p>
        ) : (
          <DiffView
            label={`Versions of ${historyFile}`}
            filename={historyFile}
            before={versions.before}
            after={versions.after}
            beforeLabel={`${historyFile} · ${versionName(range.from, log)}`}
            afterLabel={versionName(range.to, log)}
          />
        )}
      </>
    );
  } else {
    mainPane = <EmptyState title="No file selected">Select a changed file to see its diff, or a file's history to compare two of its versions.</EmptyState>;
  }
  return mainPane;
}

function versionName(rev: string, log: Commit[] = []) {
  if (rev === 'worktree') return 'Working tree';
  if (rev === 'index') return 'Last commit and staged changes';
  if (rev === 'HEAD') return 'Last commit';
  const gitCommit = log.find(x => x.commit === rev);
  return gitCommit ? `${rev.slice(0, 7)} ${gitCommit.message}` : rev.slice(0, 7);
}
