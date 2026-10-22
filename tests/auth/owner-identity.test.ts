// Which identity values may verify a metric owner, and that self-approval still refuses on any.
import { expect, test } from 'bun:test';
import { normalizeClaims } from '../../server/auth/principal';
import { ownerChoices, ownerVerifier, type KnownPerson } from '../../src/governance/guards';
import { TEST_TENANT_ID } from '../helpers/auth-identities';

const entra = { provider: 'entra' as const, tenantId: TEST_TENANT_ID, groupClaim: 'groups' };
const keycloak = { provider: 'keycloak' as const, tenantId: null, groupClaim: 'groups' };
const entraClaims = { tid: TEST_TENANT_ID, oid: 'a1100000-0000-4000-8000-000000000099' };

test('only an Entra member user principal name is a verified username', () => {
  const member = normalizeClaims({ ...entraClaims, preferred_username: 'Ann@Example.org' }, entra);
  expect(member.usernameVerified).toBe(true);
  const guest = normalizeClaims(
    { ...entraClaims, preferred_username: 'ann_partner#EXT#@tenant.onmicrosoft.com' },
    entra,
  );
  expect(guest.usernameVerified).toBe(false);
  const otherTenant = normalizeClaims(
    {
      ...entraClaims,
      iss: `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`,
      idp: 'https://sts.windows.net/0b8e6c2a-1f3d-4e5a-9c7b-2d4f6a8b0c1e/',
      preferred_username: 'ann@partner.example',
    },
    entra,
  );
  expect(otherTenant.usernameVerified).toBe(false);
  const homeIssuer = `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`;
  const sameIdp = normalizeClaims(
    { ...entraClaims, iss: homeIssuer, idp: homeIssuer, preferred_username: 'ann@example.org' },
    entra,
  );
  expect(sameIdp.usernameVerified).toBe(true);
  const fromEmail = normalizeClaims({ ...entraClaims, email: 'ann@example.org' }, entra);
  expect(fromEmail.username).toBe('ann@example.org');
  expect(fromEmail.usernameVerified).toBe(false);
  const editable = normalizeClaims(
    { iss: 'https://idp.example', sub: 's1', preferred_username: 'ann' },
    keycloak,
  );
  expect(editable.usernameVerified).toBe(false);
});

test('owner verification and owner choices use verified identities only', () => {
  const person = (fields: Partial<KnownPerson>): KnownPerson => ({
    kind: 'person',
    name: 'Ann',
    access: 'granted',
    verifiedEmail: null,
    username: 'ann',
    ...fields,
  });
  const unverified = person({ username: 'ann' });
  const verifiedUsername = person({
    name: 'Bea',
    username: 'bea@example.org',
    usernameVerified: true,
  });
  const verifiedAddress = person({
    name: 'Cid',
    verifiedEmail: 'cid@example.org',
    username: 'cid',
  });
  const verified = ownerVerifier([unverified, verifiedUsername, verifiedAddress]);
  expect(verified('ann')).toBe(false);
  expect(verified('BEA@example.org')).toBe(true);
  expect(verified('cid@example.org')).toBe(true);
  expect(verified('cid')).toBe(false);
  expect(ownerChoices([unverified, verifiedUsername, verifiedAddress])).toEqual([
    { name: 'Bea', owner: 'bea@example.org' },
    { name: 'Cid', owner: 'cid@example.org' },
  ]);
});
