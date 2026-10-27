/** The person's own Git host accounts in server mode: where the browser goes to connect one,
 * and the **Connected accounts** dialog of the person menu. */
import { Modal } from '../projects/Modal';
import { startLeavingPage } from '../projects/api';
import type { Me } from './useMe';

/** The account a remote action needs: GitHub consent, or a new sign-in for Azure DevOps. */
export type ConnectKind = 'github' | 'azure-devops';

/** Where the browser goes to grant the credential, coming back to the current page. */
export function connectUrl(kind: ConnectKind) {
  const here = globalThis.location.pathname + globalThis.location.search;
  const returnTo = encodeURIComponent(here);
  if (kind === 'github') return `/auth/github/start?returnTo=${returnTo}`;
  return `/auth/login?returnTo=${returnTo}`;
}

/** Leaves the page for the consent or sign-in that grants the credential. */
export function connectAccount(kind: ConnectKind) {
  startLeavingPage();
  globalThis.location.assign(connectUrl(kind));
}

function githubStatus(me: Me) {
  if (!me.githubConfigured) return 'Not available on this server.';
  return me.connected?.github ? 'Connected for this session.' : 'Not connected.';
}

/** Summarises the accounts for the person menu's hint. */
export function accountsSummary(me: Me) {
  if (me.connected?.github) return 'GitHub connected';
  if (me.azureDevOpsAvailable) return 'Azure DevOps through your sign-in';
  return 'No accounts connected';
}

/** Lists the person's Git host accounts with **Connect GitHub**. */
export function ConnectedAccountsDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const canConnect = Boolean(me.githubConfigured && !me.connected?.github);
  const footer = (
    <>
      <span className="dialog-footer-spacer" />
      <button type="button" onClick={onClose}>
        Close
      </button>
      {canConnect && (
        <button type="button" className="primary" onClick={() => connectAccount('github')}>
          Connect GitHub
        </button>
      )}
    </>
  );
  return (
    <Modal title="Connected accounts" onCancel={onClose} size="narrow" footer={footer}>
      <dl className="connected-accounts">
        <dt>GitHub</dt>
        <dd>{githubStatus(me)}</dd>
        <dt>Azure DevOps</dt>
        <dd>
          {me.azureDevOpsAvailable
            ? 'Uses your workbench sign-in; nothing to connect.'
            : 'Not available on this server.'}
        </dd>
      </dl>
      <p>Pushes and pulls use your own account. Connections end when you sign out.</p>
    </Modal>
  );
}
