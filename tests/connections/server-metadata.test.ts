// Checks the documents against the contract: fields, derived addresses, and that nothing unsupported is advertised.
import { expect, test } from 'bun:test';
import { MCP_PATH } from '../../src/server/routes/mcp';
import { MCP_RESOURCE_PATH, SETUP_GRANT_TYPE, authorizationServerMetadata, bearerChallenge, mcpResource, protectedResourceMetadata } from '../../src/server/connections/server-metadata';

const publicUrl = 'https://wb.example.org';

test('the resource path is the path the endpoint answers on', () => {
  expect(MCP_RESOURCE_PATH).toBe(MCP_PATH);
  expect(mcpResource(publicUrl)).toBe('https://wb.example.org/api/mcp');
});

test('the protected resource document names the resource and this server as its authorization server', () => {
  expect(protectedResourceMetadata(publicUrl)).toEqual({
    resource: 'https://wb.example.org/api/mcp',
    authorization_servers: ['https://wb.example.org'],
    bearer_methods_supported: ['header'],
    scopes_supported: ['read', 'validate', 'edit', 'commit', 'remote', 'publish'],
  });
});

test('the authorization server document lists only what is supported', () => {
  const metadata = authorizationServerMetadata(publicUrl);
  expect(metadata).toMatchObject({
    issuer: 'https://wb.example.org',
    authorization_endpoint: 'https://wb.example.org/oauth/authorize',
    token_endpoint: 'https://wb.example.org/oauth/token',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', SETUP_GRANT_TYPE],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  });
  for (const absent of ['registration_endpoint', 'jwks_uri', 'introspection_endpoint', 'revocation_endpoint', 'client_id_metadata_document_supported']) expect(metadata).not.toHaveProperty(absent);
  expect(metadata.scopes_supported).not.toContain('administration');
});

test('every address comes from the configured public address alone', () => {
  const other = 'https://other.example.net';
  expect(JSON.stringify(protectedResourceMetadata(other))).not.toContain('wb.example.org');
  expect(JSON.stringify(authorizationServerMetadata(other))).not.toContain('wb.example.org');
  expect(bearerChallenge(other)).toBe('Bearer resource_metadata="https://other.example.net/.well-known/oauth-protected-resource/api/mcp"');
});

test('the challenge gives no reason', () => {
  expect(bearerChallenge(publicUrl)).not.toMatch(/error|expired|invalid|revoked/i);
});
