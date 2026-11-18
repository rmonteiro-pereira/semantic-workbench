// Server mode: trades the single-use credential shown in the panel for a connection token, kept in memory only.

/** The registered name of the relay program. */
const RELAY_CLIENT_ID = 'acp-relay';
const SETUP_GRANT_TYPE = 'urn:semantic-workbench:grant-type:setup';

/** The token the relay presents on every request. It is refreshed shortly before it expires. */
export type RelayToken = { current: () => string };
type TokenReply = { access_token: string; refresh_token: string; expires_in: number };

async function tokenReply(response: Response | undefined): Promise<TokenReply | undefined> {
  if (response?.status !== 200) return undefined;
  const reply = await response.json().catch(() => undefined);
  if (!reply || reply.token_type !== 'Bearer') return undefined;
  if (typeof reply.access_token !== 'string' || !reply.access_token.trim()) return undefined;
  if (typeof reply.refresh_token !== 'string' || !reply.refresh_token.trim()) return undefined;
  if (!Number.isSafeInteger(reply.expires_in) || reply.expires_in <= 0) return undefined;
  return reply;
}

/** Trades the credential once. Returns undefined when the workbench refuses it. */
export async function exchangeCredential(baseUrl: string, credential: string, request: (url: string, options: RequestInit) => Promise<Response> = fetch): Promise<RelayToken | undefined> {
  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ client_id: RELAY_CLIENT_ID, resource: `${baseUrl}/api/mcp`, ...fields }),
  });
  const first = await request(`${baseUrl}/oauth/token`, form({ grant_type: SETUP_GRANT_TYPE, setup_credential: credential })).catch(() => undefined);
  const initial = await tokenReply(first);
  if (!initial) return undefined;
  let tokens = initial;
  let refreshAt = Date.now() + tokens.expires_in * 800;
  let refreshing = false;
  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      const response = await request(`${baseUrl}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).catch(() => undefined);
      const refreshed = await tokenReply(response);
      if (!refreshed) {
        tokens = { access_token: '', refresh_token: '', expires_in: 0 };
        refreshAt = Infinity;
        console.error('The relay connection could not be refreshed. Start a new session in the panel.');
        return;
      }
      tokens = refreshed;
      refreshAt = Date.now() + tokens.expires_in * 800;
    } finally {
      refreshing = false;
    }
  }
  return {
    current() {
      if (Date.now() >= refreshAt) void refresh();
      return tokens.access_token;
    },
  };
}
