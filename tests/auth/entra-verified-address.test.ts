// Only an address the tenant vouches for may match an e-mail grant or a bootstrap Admin: a
// verified e-mail claim, or the user name of a member of the home directory.
import { expect, test } from 'bun:test';
import { normalizeClaims, type ClaimMapping } from '../../server/auth/principal';

const tenant = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';
const entra: ClaimMapping = { provider: 'entra', groupClaim: 'groups', tenantId: tenant };
const homeIssuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
const otherDirectory = 'https://sts.windows.net/0b8e6c2a-1f3d-4e5a-9c7b-2d4f6a8b0c1e/';

function claims(extra: Record<string, unknown>) {
  return { iss: homeIssuer, oid: 'a1100000-0000-4000-8000-000000000001', tid: tenant, ...extra };
}

const verifiedEmail = (extra: Record<string, unknown>) =>
  normalizeClaims(claims(extra), entra).verifiedEmail;

test('a user from another directory has no verified address from its editable user name', () => {
  const visiting = { idp: otherDirectory, preferred_username: 'ceo@example.org' };
  expect(verifiedEmail(visiting)).toBeNull();
  expect(verifiedEmail({ ...visiting, upn: 'ceo@example.org' })).toBeNull();
});

test('a guest user name is not an address, even when it looks like one', () => {
  expect(verifiedEmail({ preferred_username: 'ceo_example.org#EXT#@tenant.onmicrosoft.com' })).toBe(
    null,
  );
  expect(verifiedEmail({ upn: 'ceo@example.org#EXT#@tenant.onmicrosoft.com' })).toBeNull();
});

test('a verified e-mail claim still counts for a user from another directory', () => {
  const visiting = { idp: otherDirectory, email: 'Partner@Other.example', xms_edov: true };
  expect(verifiedEmail(visiting)).toBe('partner@other.example');
});

test('a verified e-mail claim that carries the guest marker is not an address', () => {
  expect(verifiedEmail({ email: 'ceo#EXT#@tenant.onmicrosoft.com', xms_edov: true })).toBeNull();
});

test('an e-mail claim the tenant did not verify is never an address', () => {
  expect(verifiedEmail({ idp: otherDirectory, email: 'partner@other.example' })).toBeNull();
});

test('a member of the home directory is identified by their user name', () => {
  expect(verifiedEmail({ preferred_username: 'Alice@Example.org' })).toBe('alice@example.org');
  expect(verifiedEmail({ upn: 'bob@example.org', preferred_username: 'x@y.example' })).toBe(
    'bob@example.org',
  );
  expect(verifiedEmail({ idp: homeIssuer, preferred_username: 'carol@example.org' })).toBe(
    'carol@example.org',
  );
});
