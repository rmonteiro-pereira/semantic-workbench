// Uses the shared keyboard menu and a native form for session sign-out.
import './PersonMenu.css';
import { useRef, useState } from 'react';
import { MenuButton } from '../projects/Menu';
import { startLeavingPage } from '../projects/api';
import { personRoles, useMe } from './useMe';
import { accountsSummary, ConnectedAccountsDialog } from './ConnectedAccounts';

/** Takes the first letters of the first and last word of a name, for the avatar. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  if (words.length === 1) return first.toUpperCase();
  return (first + words[words.length - 1][0]).toUpperCase();
}

/** Shows the server identity and submits sign-out with the session's form token. */
export function PersonMenu() {
  const { me, error } = useMe();
  const form = useRef<HTMLFormElement>(null);
  const [accounts, setAccounts] = useState(false);
  if (error) return <span role="status">{error}</span>;
  if (!me || me.mode === 'local') return null;
  function signOut() {
    startLeavingPage();
    form.current?.requestSubmit();
  }
  const details = [me.name, me.verifiedEmail, ...personRoles(me)].filter((entry): entry is string => Boolean(entry));
  return (
    <>
      <MenuButton
        ariaLabel="Account and Admin"
        className="person-menu"
        menuLabel={`Person menu for ${me.name}`}
        header={
          <div className="person-summary" role="presentation">
            <strong>{me.name}</strong>
            {me.verifiedEmail && <span>{me.verifiedEmail}</span>}
            <span>{personRoles(me).join(', ')}</span>
          </div>
        }
        label={
          <span className="person-avatar" aria-hidden="true">
            {initialsOf(me.name)}
          </span>
        }
        buttonClassName="person-avatar-button"
        title={details.join(' · ')}
        items={[
          {
            label: 'Connected accounts',
            hint: accountsSummary(me),
            run: () => setAccounts(true),
          },
          { label: 'Sign out', run: signOut, disabled: !me.csrf && 'Session token unavailable' },
        ]}
      />
      {accounts && <ConnectedAccountsDialog me={me} onClose={() => setAccounts(false)} />}
      <form ref={form} method="post" action="/auth/logout" hidden>
        <input type="hidden" name="csrf" value={me.csrf ?? ''} />
      </form>
    </>
  );
}
