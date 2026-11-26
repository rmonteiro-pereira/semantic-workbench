import { SavedNote, UnsavedChangesNote, useSavedAt } from './SaveStatus';
import { Fragment, useCallback, useState } from 'react';
import { useMe } from '../auth/useMe';
import { EmptyState } from '../projects/EmptyState';
import { whenLabel } from './helpers';
import { AdminConfirmation } from './AdminConfirmation';
import { adminApi, problemText } from './api';
import { useAdminData } from './useAdminData';
import { SectionStatus } from './SectionStatus';
import { VersionHistory } from './VersionHistory';
import type { Provider, Settings } from './types';
import { UsageCountersStatus } from '../usage/UsageCountersStatus';

/** Shows public provider health, editable session lifetimes and revocable active sessions. */
export function SettingsSection() {
  const { me } = useMe();
  const local = me?.mode === 'local';
  const load = useCallback(async () => {
    const [settings, sessions, provider] = await Promise.all([adminApi.settings(), adminApi.sessions(), local ? Promise.resolve(null) : adminApi.provider()]);
    return { version: settings.version, settings: settings.document, sessions, provider };
  }, [local]);
  const { data, error, reload } = useAdminData(load);
  const { savedAt, markSaved } = useSavedAt();
  function saved() {
    markSaved();
    reload();
  }
  const [end, setEnd] = useState<{ principal: string; name: string } | null>(null);
  const [failure, setFailure] = useState('');
  const [history, setHistory] = useState(false);
  async function endSessions() {
    if (!end) return;
    try {
      await adminApi.endSessions(end.principal);
      setEnd(null);
      reload();
    } catch (problem) {
      setFailure(`End sessions for ${end.name}: ${problemText(problem)}`);
    }
  }
  if (history) {
    return (
      <VersionHistory
        area="settings"
        backLabel="Back to settings"
        onBack={() => {
          setHistory(false);
          reload();
        }}
      />
    );
  }
  return (
    <>
      <button onClick={() => setHistory(true)}>History</button>
      <SectionStatus subject="the workspace settings" loading={!data && !error} error={error} onRetry={reload} />
      {failure && <p role="alert">{failure}</p>}
      <SavedNote at={savedAt} />
      {data && (
        <>
          <h3>Provider status</h3>
          {local && <p>Provider settings apply in server mode.</p>}
          {data.provider && <ProviderFacts provider={data.provider} />}
          <UsageCountersStatus />
          <SettingsEditor key={data.version} initial={data.settings} version={data.version} onSaved={saved} />
          <section aria-label="Active sessions">
            <h3>Active sessions</h3>
            {data.sessions.length === 0 && (
              <EmptyState title="No active sessions">
                {local && 'No sign-in is needed in local mode. '}
                Sessions appear when people sign in to server mode.
              </EmptyState>
            )}
            {data.sessions.map((session, index) => (
              <section key={index}>
                <p>
                  {session.name} ({session.principal}) · created {whenLabel(session.createdAt)} · last seen {whenLabel(session.lastSeenAt)}
                </p>
                <button className="admin-remove" onClick={() => setEnd({ principal: session.principal, name: session.name })}>
                  End sessions
                </button>
              </section>
            ))}
          </section>
        </>
      )}
      {end && (
        <AdminConfirmation
          title={`End sessions for ${end.name}?`}
          onCancel={() => setEnd(null)}
          size="narrow"
          actions={
            <button className="danger" onClick={endSessions}>
              End sessions
            </button>
          }
        >
          <p>{end.name} is signed out everywhere and has to sign in again. Their roles do not change.</p>
          {failure && <p role="alert">{failure}</p>}
        </AdminConfirmation>
      )}
    </>
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

function SettingsEditor({ initial, version, onSaved }: { initial: Settings; version: string; onSaved: () => void }) {
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
        <input type="number" min="1" value={settings.session.idleHours} onChange={event => lifetime('idleHours', event.target.value)} />
      </label>
      <p className="admin-field-hint">Signs a person out after this many hours without activity.</p>
      <label>
        Absolute hours
        <input type="number" min="1" value={settings.session.absoluteHours} onChange={event => lifetime('absoluteHours', event.target.value)} />
      </label>
      <p className="admin-field-hint">Signs a person out this many hours after they signed in, even while active.</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy || settings.session.idleHours <= 0 || settings.session.absoluteHours <= 0} onClick={() => setConfirm(true)}>
        Save settings
      </button>
      {!confirm && JSON.stringify(settings) !== JSON.stringify(initial) && <UnsavedChangesNote action="Save settings" />}
      {confirm && (
        <>
          <p>Save these session lifetimes?</p>
          <button disabled={busy} onClick={save}>
            Confirm save settings
          </button>
          <button onClick={() => setConfirm(false)}>Cancel</button>
        </>
      )}
      <h3>Remote-credential policy</h3>
      <p>Allowed hosts: {settings.remote.allowedHosts.join(', ') || 'None configured (server mode refuses remote access).'}</p>
      <p>Azure DevOps on-behalf-of: {settings.remote.azureDevOpsObo ? 'On' : 'Off'}</p>
      <p>
        GitHub: {settings.remote.github.host} · {settings.remote.github.appConfigured ? 'App configured' : 'App not configured'}
      </p>
    </section>
  );
}
