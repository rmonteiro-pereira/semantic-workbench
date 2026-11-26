// The Proposals section of Source Control: what several people prepare together before it is
// published. It exists in server mode only and refreshes when a proposal changes.
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ProposalSummary } from '../../shared/proposals/proposal';
import { useCapabilities } from '../auth/Capabilities';
import { useMe } from '../auth/useMe';
import type { ProjectInfo } from '../projects/api';
import { proposals } from './api';
import { CreateProposalDialog } from './CreateProposalDialog';
import { ProposalDetail } from './ProposalDetail';
import { ProposalList } from './ProposalList';
import { CONFINEMENT_NOTE, problemText } from './proposal-wording';
import './proposals.css';

type Props = { project: string; projects: ProjectInfo[]; version: number };

type Listing = { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; items: ProposalSummary[] };

/** Lists the proposals of the project's repository and opens, creates and refreshes them. */
export function ProposalsSection({ project, projects, version }: Props) {
  const access = useCapabilities(project);
  // Proposals exist in server mode only, so nothing is asked until the person is known to be in it.
  const { me } = useMe();
  const server = me?.mode === 'server';
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [opened, setOpened] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setListing({ state: 'ready', items: await proposals.list(project) });
    } catch (problem) {
      setListing({ state: 'failed', message: problemText(problem) });
    }
  }, [project]);
  useEffect(() => {
    setListing({ state: 'loading' });
  }, [project]);
  useEffect(() => {
    if (server) void refresh();
  }, [server, refresh, version]);
  if (!server) return null;
  const repo = projects.find(item => item.slug === project)?.repo;
  const choices = projects.filter(item => item.repo === repo && access.can('edit', item.slug) && access.can('branch', item.slug)).map(item => ({ slug: item.slug, name: item.name }));
  return (
    <section className="scm-group proposals" aria-label="Proposals">
      <h3>
        <span>Proposals</span>
        <button className="link" disabled={!choices.length} onClick={() => setCreating(true)} title={choices.length ? undefined : 'You cannot edit any project of this repository.'}>
          <Plus size={13} /> New proposal
        </button>
      </h3>
      {listing.state === 'loading' && (
        <p role="status" className="scm-empty">
          Loading proposals
        </p>
      )}
      {listing.state === 'failed' && (
        <p role="alert" className="scm-note warning">
          <span>{listing.message}</span>
          <button onClick={() => void refresh()}>Try again</button>
        </p>
      )}
      {listing.state === 'ready' && listing.items.length === 0 && <p className="scm-empty">No proposals yet. A proposal lets several people prepare a change together before it is published.</p>}
      {listing.state === 'ready' && listing.items.length > 0 && <ProposalList items={listing.items} onOpen={setOpened} />}
      <p className="scm-empty">{CONFINEMENT_NOTE}</p>
      {creating && (
        <CreateProposalDialog
          project={project}
          choices={choices}
          onCancel={() => setCreating(false)}
          onCreated={id => {
            setCreating(false);
            setOpened(id);
            void refresh();
          }}
        />
      )}
      {opened && <ProposalDetail project={project} id={opened} version={version} onClose={() => setOpened(null)} onChanged={() => void refresh()} />}
    </section>
  );
}
