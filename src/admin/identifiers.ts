/** Creates a random lower-case hex identifier for a new grant, role or policy rule. */
// crypto.randomUUID exists only in secure contexts, and a team workbench may be reached over
// plain HTTP inside a private network, so the identifier is built from getRandomValues instead.
export function newIdentifier(prefix: 'g_' | 'r_' | 'p_'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return prefix + hex;
}
