import { useMe } from '../../auth/useMe';

/** Says so when the signed-in person holds Admin only through server configuration. */
export function BootstrapNotice() {
  const { me } = useMe();
  const bootstrap = me?.roleSources?.some(source => source.via === 'bootstrap');
  if (!bootstrap) return null;
  return (
    <p className="admin-notice">Bootstrap Admin — emergency access from server configuration.</p>
  );
}

/** Warns on the screens where a change could remove the last active Admin. */
export function LastAdminNotice() {
  return <p className="admin-notice">Changes that remove the last active Admin are refused.</p>;
}
