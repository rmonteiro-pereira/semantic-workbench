// The two discovery documents and the bearer challenge. Every address comes from the configured public address, never from a request header, so a forged Host header cannot point a program at another server.
import { offeredScopes } from './scopes';

/** The path of the agent endpoint, which is the protected resource. */
export const MCP_RESOURCE_PATH = '/api/mcp';
/** Where the protected resource metadata is served, named after the resource's own path. */
export const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/api/mcp';
/** The same document, for programs that look at the root address. */
export const PROTECTED_RESOURCE_ROOT_PATH = '/.well-known/oauth-protected-resource';
export const AUTHORIZATION_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';
export const AUTHORIZE_PATH = '/oauth/authorize';
export const TOKEN_PATH = '/oauth/token';

/** The grant type of a setup credential, defined by this server. */
export const SETUP_GRANT_TYPE = 'urn:semantic-workbench:grant-type:setup';

/** How long a program may keep a metadata document. Assumed: the documents change only with the configured address. */
export const METADATA_MAX_AGE_SECONDS = 300;

/** The one resource address every token is bound to. */
export function mcpResource(publicUrl: string): string {
  return publicUrl + MCP_RESOURCE_PATH;
}

/** The address of the issuer. It has no path, which the configuration requires of the public address. */
export function issuerOf(publicUrl: string): string {
  return publicUrl;
}

export function protectedResourceMetadata(publicUrl: string) {
  return {
    resource: mcpResource(publicUrl),
    authorization_servers: [issuerOf(publicUrl)],
    bearer_methods_supported: ['header'],
    scopes_supported: offeredScopes(),
  };
}

/** No registration endpoint, no key set and no introspection or revocation endpoint are listed, because none exists. */
export function authorizationServerMetadata(publicUrl: string) {
  return {
    issuer: issuerOf(publicUrl),
    authorization_endpoint: publicUrl + AUTHORIZE_PATH,
    token_endpoint: publicUrl + TOKEN_PATH,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', SETUP_GRANT_TYPE],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: offeredScopes(),
    // The authorization response carries `iss`, so a program can tell this server from another one it talks to.
    authorization_response_iss_parameter_supported: true,
  };
}

/** The header of the 401 answer. It points at the metadata and says nothing about why the token failed. */
export function bearerChallenge(publicUrl: string): string {
  return `Bearer resource_metadata="${publicUrl}${PROTECTED_RESOURCE_METADATA_PATH}"`;
}
