// One proposal in a dialog: its status and projects, the files it changes, the actions the person's
// authority allows, and the promotion check that must pass before it is published.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../projects/Modal';
import type { PromotionCheck as CheckResult, ProposalView } from '../../shared/proposals/proposal';
import { proposals } from './api';
import { PromotionCheck } from './PromotionCheck';
import { ProposalChanges } from './ProposalChanges';
import { CONFINEMENT_NOTE, STATUS_LABEL, behindLine, problemText } from './proposal-wording';

type Props = { project: string; id: string; version: number; onClose: () => void; onChanged: () => void };

/** Loads one proposal and keeps it current while the dialog is open. */
function useProposal(project: string, id: string, version: number) {
  const [view, setView] = useState<ProposalView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setView(await proposals.read(project, id));
      setFailure(null);
    } catch (problem) {
      setFailure(problemText(problem));
    }
  }, [project, id]);
  useEffect(() => {
    void reload();
  }, [reload, version]);
  return { view, failure, reload };
}

/** Shows a proposal and the actions its status and the person's authority allow. */
export function ProposalDetail({ project, id, version, onClose, onChanged }: Props) {
  const { view, failure, reload } = useProposal(project, id, version);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [check, setCheck] = useState<{ tip: string; result: CheckResult } | null>(null);
  const names = new Map(view?.projects.map(item => [item.slug, item.name]));
  const projectName = (slug: string) => names.get(slug) ?? slug;
  // Runs one operation, then reloads: a refusal is shown and the proposal is read again so a stale view heals.
  async function run(operation: () => Promise<string | void>) {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const said = await operation();
      if (said) setNotice(said);
    } catch (error) {
      setProblem(problemText(error));
    }
    await reload();
    onChanged();
    setBusy(false);
  }
  if (!view) {
    return (
      <Modal title="Proposal" onCancel={onClose} footer={<button onClick={onClose}>Done</button>}>
        {failure ? (
          <p role="alert" className="scm-note warning">
            {failure}
          </p>
        ) : (
          <p className="scm-empty">Loading the proposal…</p>
        )}
      </Modal>
    );
  }
  const tip = view.tip ?? '';
  const checked = check?.tip === tip ? check.result : null;
  const open = view.status === 'open';
  const promotable = open && view.may.promote;
  return (
    <Modal
      title={view.name}
      size="wide"
      onCancel={onClose}
      footerNote={promotable && !checked?.ok ? 'Check the promotion before publishing.' : undefined}
      footer={
        <>
          <button onClick={onClose}>Done</button>
          {promotable && (
            <button className="primary" disabled={busy || !checked?.ok} onClick={() => void run(async () => void (await proposals.promote(project, id, tip)))}>
              Promote proposal
            </button>
          )}
        </>
      }
    >
      <div className="proposal-detail">
        <p className="proposal-summary">
          <span className={`proposal-status status-${view.status}`}>{STATUS_LABEL[view.status]}</span> Started by {view.createdByName} on {new Date(view.createdAt).toLocaleDateString()}.{' '}
          {behindLine(view.behindPublished)}
        </p>
        <p>Changes {view.projects.map(item => item.name).join(', ')}.</p>
        <p>{view.contributors.length ? `Contributors: ${view.contributors.join(', ')}.` : 'No contributions yet.'}</p>
        <p className="scm-empty">{CONFINEMENT_NOTE}</p>
        <div className="proposal-actions">
          {open && view.may.contribute && (
            <button disabled={busy} onClick={() => void run(async () => `Now on ${(await proposals.work(project, id)).branch}.`)}>
              Work on this proposal
            </button>
          )}
          {open && view.mine && view.may.contribute && (
            <>
              <button disabled={busy} onClick={() => void run(async () => syncNotice(await proposals.synchronize(project, id)))}>
                Synchronize
              </button>
              <button disabled={busy} onClick={() => void run(async () => void (await proposals.contribute(project, id, tip)))}>
                Contribute
              </button>
            </>
          )}
          {promotable && (
            <button disabled={busy} onClick={() => void run(async () => void setCheck({ tip, result: await proposals.check(project, id, tip) }))}>
              Check promotion
            </button>
          )}
          {open && view.may.close && (
            <button disabled={busy} onClick={() => void run(async () => void (await proposals.close(project, id)))}>
              Close proposal
            </button>
          )}
          {view.may.restore && (
            <button disabled={busy} onClick={() => void run(async () => void (await proposals.restore(project, id)))}>
              Restore proposal
            </button>
          )}
        </div>
        {view.mine?.behind && open && <p className="scm-note warning">Your branch lacks the latest contribution. Synchronize before you contribute.</p>}
        {busy && <p className="scm-empty">Working…</p>}
        {failure && (
          <p role="alert" className="scm-note warning">
            {failure}
          </p>
        )}
        {notice && (
          <p role="status" className="scm-note">
            {notice}
          </p>
        )}
        {problem && (
          <p role="alert" className="scm-note warning">
            {problem}
          </p>
        )}
        {checked && <PromotionCheck result={checked} />}
        <ProposalChanges project={project} id={id} changes={view.changes} projectName={projectName} />
      </div>
    </Modal>
  );
}

function syncNotice(result: Awaited<ReturnType<typeof proposals.synchronize>>) {
  if (result.merged) return 'Your branch now includes the proposal.';
  return `Resolve the conflicts in Source Control, then commit: ${result.conflicted.join(', ')}.`;
}
