// Asks the Azure platform for the federated assertion of the container app's managed identity,
// which either sign-in library sends as the workbench's client credential.

/** Gets a federated assertion from the platform, without exposing its response to callers. */
export async function managedIdentityAssertion(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!env.IDENTITY_ENDPOINT || !env.IDENTITY_HEADER) {
    throw new Error('Managed identity endpoint configuration is missing.');
  }
  const url = new URL(env.IDENTITY_ENDPOINT);
  url.searchParams.set('resource', 'api://AzureADTokenExchange');
  url.searchParams.set('api-version', '2019-08-01');
  const response = await request(url, {
    headers: { 'X-IDENTITY-HEADER': env.IDENTITY_HEADER },
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Managed identity assertion unavailable.');
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string') throw new Error('Invalid managed identity assertion.');
  return body.access_token;
}
