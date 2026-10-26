// Decides which network address counts as "the client" for rate limits, so a reverse proxy in
// front of the workbench does not make every visitor look like one.
import { isIP } from 'node:net';

/** Takes an address out of a forwarded-for entry, which may carry a port or brackets. */
function parseAddress(entry: string): string | null {
  const text = entry.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(text);
  if (bracketed) return isIP(bracketed[1]) ? bracketed[1] : null;
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(text);
  const candidate = withPort ? withPort[1] : text;
  return isIP(candidate) ? candidate : null;
}

/** Expands an IPv6 address into its eight 16-bit groups. */
function ipv6Groups(address: string): string[] {
  const [head, tail] = address.split('::');
  const first = head ? head.split(':') : [];
  const last = tail ? tail.split(':') : [];
  const missing = address.includes('::') ? 8 - first.length - last.length : 0;
  return [...first, ...Array(missing).fill('0'), ...last].map(group => group.padStart(4, '0'));
}

/**
 * The key one client is limited by. An IPv4-mapped IPv6 address counts as its IPv4 address, and
 * an IPv6 address counts as its /64, because one subscriber owns a whole /64 and could otherwise
 * rotate through it to dodge a limit.
 */
export function addressKey(address: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1];
  if (isIP(address) !== 6) return address;
  return ipv6Groups(address.toLowerCase()).slice(0, 4).join(':') + '::/64';
}

/**
 * The client address for limits. With no trusted proxy it is the socket peer. With N trusted
 * proxies it is the Nth entry from the right of X-Forwarded-For, because each trusted proxy
 * appends the address it saw and anything to the left of those entries was written by the client.
 * A header that is too short or unparsable falls back to the peer.
 */
export function clientAddress(
  peer: string | undefined,
  forwardedFor: string | null,
  trustedProxyHops: number,
): string | undefined {
  if (trustedProxyHops > 0 && forwardedFor) {
    const entries = forwardedFor.split(',');
    const entry = entries[entries.length - trustedProxyHops];
    const parsed = entry === undefined ? null : parseAddress(entry);
    if (parsed) return addressKey(parsed);
  }
  return peer === undefined ? undefined : addressKey(peer);
}
