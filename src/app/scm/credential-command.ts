/** Strips any user name and password from an HTTP(S) address, which must not appear on screen. */
function withoutCredentials(address: string): string {
  return address.replace(/^(https?:\/\/)[^/@\s]*@/i, '$1');
}

/**
 * The terminal command that signs in once against a remote. `git ls-remote` reads the remote and
 * lets Git's credential helper ask for and keep the sign-in; it changes nothing.
 */
export function terminalSignInCommand(remote: string | undefined): string {
  const address = remote ? withoutCredentials(remote.trim()) : '';
  if (!address) return 'git ls-remote <remote address>';
  return `git ls-remote '${address.replaceAll("'", "'\\''")}'`;
}
