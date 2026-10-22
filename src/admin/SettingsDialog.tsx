import { Fragment, useCallback, useState } from 'react';
import { useMe } from '../auth/useMe';
import { whenLabel } from './when';
import { AdminDialog, type DialogProps } from './AdminDialog';
import { adminApi, problemText } from './api';
import { useAdminData } from './useAdminData';
import { VersionHistory } from './VersionHistory';
import type { Provider, Settings } from './types';

/** Shows public provider health, editable session lifetimes and revocable active sessions. */
export function SettingsDialog({ onClose }: DialogProps) {
  const { me } = useMe();
  const local = me?.mode === 'local';
  const load = useCallback(async () => {
    const [settings, sessions, provider] = await Promise.all([
      adminApi.settings(),
      adminApi.sessions(),
      local ? Promise.resolve(null) : adminApi.provider(),
    ]);
    return { version: settings.version, settings: settings.document, sessions, provider };
  }, [local]);
  const { data, error, reload } = useAdminData(load);
  const [end, setEnd] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const [history, setHistory] = useState(false);
  async function endSessions() {
    if (!end) return;
    try {
      await adminApi.endSessions(end);
      setEnd(null);
      reload();
    } catch (problem) {
      setFailure(`End sessions for ${end}: ${problemText(problem)}`);
    }
  }
  return (
    <AdminDialog title="Settings" onClose={onClose}>
      {(error || failure) && <p role="alert">{error || failure}</p>}
      <button onClick={() => setHistory(true)}>History</button>
      <h3>Provider status</h3>
      {local && <p>Provider settings apply in server mode.</p>}
      {data?.provider && <ProviderFacts provider={data.provider} />}
      {data && (
        <>
          <SettingsEditor
            key={data.version}
            initial={data.settings}
            version={data.version}
            onSaved={reload}
          />
          <h3>Active sessions</h3>
          {data.sessions.map((session, index) => (
            <section key={index}>
              <p>
                {session.name} ({session.principal}) · created {whenLabel(session.createdAt)} · last
                seen {whenLabel(session.lastSeenAt)}
              </p>
              <button onClick={() => setEnd(session.principal)}>End session</button>
            </section>
          ))}
        </>
      )}
      {end && (
        <AdminDialog title="End sessions" onClose={() => setEnd(null)} size="small">
          <p>End all sessions for {end}?</p>
          {failure && <p role="alert">{failure}</p>}
          <button onClick={endSessions}>Confirm end sessions</button>
        </AdminDialog>
      )}
      {history && (
        <VersionHistory
          area="settings"
          onClose={() => {
            setHistory(false);
            reload();
          }}
        />
      )}
    </AdminDialog>
  );
}

const providerLabels: Record<keyof Provider, string> = {
  issuer: 'Issuer',
  clientId: 'Client ID',
  discovery: 'Discovery',
  groupClaimMode: 'Group mode',
  overage: 'Group overage',
  jwksRefreshedAt: 'Keys refreshed',
};

function providerValue(provider: Provider, key: keyof Provider): string {
  const value = provider[key];
  if (value === null) return 'Not available';
  return key === 'jwksRefreshedAt' ? whenLabel(value) : value;
}

function ProviderFacts({ provider }: { provider: Provider }) {
  return (
    <dl className="admin-facts">
      {(Object.keys(providerLabels) as (keyof Provider)[]).map(key => (
        <Fragment key={key}>
          <dt>{providerLabels[key]}</dt>
          <dd>{providerValue(provider, key)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function SettingsEditor({
  initial,
  version,
  onSaved,
}: {
  initial: Settings;
  version: string;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function lifetime(field: 'idleHours' | 'absoluteHours', value: string) {
    setSettings({ ...settings, session: { ...settings.session, [field]: Number(value) } });
    setConfirm(false);
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await adminApi.saveSettings(settings, version);
      setConfirm(false);
      onSaved();
    } catch (problem) {
      setError(`Save settings: ${problemText(problem)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Session lifetimes</h3>
      <label>
        Idle hours
        <input
          type="number"
          min="1"
          value={settings.session.idleHours}
          onChange={event => lifetime('idleHours', event.target.value)}
        />
      </label>
      <label>
        Absolute hours
        <input
          type="number"
          min="1"
          value={settings.session.absoluteHours}
          onChange={event => lifetime('absoluteHours', event.target.value)}
        />
      </label>
      <h3>Remote-credential policy</h3>
      <p>Allowed hosts: {settings.remote.allowedHosts.join(', ')}</p>
      <p>Azure DevOps on-behalf-of: {settings.remote.azureDevOpsObo ? 'On' : 'Off'}</p>
      <p>
        GitHub: {settings.remote.github.host} ·{' '}
        {settings.remote.github.appConfigured ? 'App configured' : 'App not configured'}
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        disabled={busy || settings.session.idleHours <= 0 || settings.session.absoluteHours <= 0}
        onClick={() => setConfirm(true)}
      >
        Save settings
      </button>
      {confirm && (
        <>
          <p>Save these session lifetimes?</p>
          <button disabled={busy} onClick={save}>
            Confirm save settings
          </button>
          <button onClick={() => setConfirm(false)}>Cancel changes</button>
        </>
      )}
    </section>
  );
}
