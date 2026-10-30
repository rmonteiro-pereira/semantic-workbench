// Uses the shared keyboard menu and a native form for session sign-out.
import './PersonMenu.css';
import { useRef, useState } from 'react';
import { MenuButton } from '../projects/Menu';
import type { MenuItem } from '../projects/Menu';
import { useAdminEntry } from '../admin/admin-entry';
import { startLeavingPage } from '../projects/api';
import { personRoles, useMe } from './useMe';
import { accountsSummary, ConnectedAccountsDialog } from './ConnectedAccounts';

/** Up to two initials of a display name, for the avatar. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * Shows who is working as an avatar with their initials, in local and server mode alike. Its menu
 * opens Admin for those allowed, and in server mode also lists connected accounts and signs out
 * with the session's form token.
 */
export function PersonMenu() {
  const { me, error } = useMe();
  const openAdmin = useAdminEntry();
  const form = useRef<HTMLFormElement>(null);
  const [accounts, setAccounts] = useState(false);
  if (error) return <span role="status">{error}</span>;
  if (!me) return null;
  const local = me.mode === 'local';
  function signOut() {
    startLeavingPage();
    form.current?.requestSubmit();
  }
  const items: MenuItem[] = [];
  if (openAdmin) items.push({ label: 'Admin', run: openAdmin });
  if (!local) {
    items.push({ label: 'Connected accounts', hint: accountsSummary(me), run: () => setAccounts(true) });
    items.push({ label: 'Sign out', run: signOut, disabled: !me.csrf && 'Session token unavailable' });
  }
  const details = [me.name, me.verifiedEmail, ...personRoles(me)].filter((entry): entry is string => Boolean(entry));
  return (
    <>
      <MenuButton
        ariaLabel="Person menu"
        className="person-menu"
        menuLabel={`Person menu for ${me.name}`}
        header={
          <div className="person-summary" role="presentation">
            <strong>{me.name}</strong>
            {me.verifiedEmail && <span>{me.verifiedEmail}</span>}
            <span>{personRoles(me).join(', ')}</span>
          </div>
        }
        title={details.join(' · ')}
        icon={
          <span className="person-avatar" aria-hidden="true">
            {initialsOf(me.name)}
          </span>
        }
        items={items}
      />
      {accounts && <ConnectedAccountsDialog me={me} onClose={() => setAccounts(false)} />}
      {!local && (
        <form ref={form} method="post" action="/auth/logout" hidden>
          <input type="hidden" name="csrf" value={me.csrf ?? ''} />
        </form>
      )}
    </>
  );
}
