// Server mode: trades the single-use credential shown in the panel for a connection token, kept in memory only.

/** The registered name of the relay program. */
const RELAY_CLIENT_ID = 'acp-relay';
const SETUP_GRANT_TYPE = 'urn:semantic-workbench:grant-type:setup';

/** The token the relay presents on every request. It is refreshed shortly before it expires. */
export type RelayToken = { current: () => string };

/** Trades the credential once. Returns undefined when the workbench refuses it. */
export async function exchangeCredential(baseUrl: string, credential: string, request: typeof fetch = fetch): Promise<RelayToken | undefined> {
  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: RELAY_CLIENT_ID, resource: `${baseUrl}/api/mcp`, ...fields }),
  });
  const first = await request(`${baseUrl}/oauth/token`, form({ grant_type: SETUP_GRANT_TYPE, setup_credential: credential })).catch(() => undefined);
  if (!first?.ok) return undefined;
  let tokens = (await first.json()) as { access_token: string; refresh_token: string; expires_in: number };
  let refreshAt = Date.now() + tokens.expires_in * 800;
  let refreshing = false;
  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      const response = await request(`${baseUrl}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }));
      if (!response.ok) return;
      tokens = (await response.json()) as typeof tokens;
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
