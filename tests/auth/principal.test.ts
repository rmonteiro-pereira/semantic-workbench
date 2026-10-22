// Tests how identity provider claims become a principal: stable ids, groups, the verified address
// that e-mail grants match, and the claims that are deliberately ignored.
import { describe, expect, test } from 'bun:test';
import {
  localPrincipal,
  normalizeClaims,
  principalKey,
  type ClaimMapping,
} from '../../server/auth/principal';

const tenant = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';
const entra: ClaimMapping = { provider: 'entra', groupClaim: 'groups', tenantId: tenant };
const keycloak: ClaimMapping = { provider: 'keycloak', groupClaim: 'groups', tenantId: null };
const generic: ClaimMapping = { provider: 'generic', groupClaim: 'groups', tenantId: null };
const issuer = 'https://sso.example.org/realms/workbench';

/** Entra ID-token claims for a member account, overridable per test. */
function entraClaims(extra: Record<string, unknown> = {}) {
  return {
    iss: `https://login.microsoftonline.com/${tenant}/v2.0`,
    sub: 'pairwise-subject',
    oid: 'A1100000-0000-4000-8000-000000000001',
    tid: tenant,
    name: 'Alice Andrade',
    preferred_username: 'alice@example.org',
    ...extra,
  };
}

describe('Entra claims', () => {
  test('the stable id is tenant and object id, never the pairwise subject', () => {
    const principal = normalizeClaims(entraClaims(), entra);
    expect(principal.id).toBe(`${tenant}:a1100000-0000-4000-8000-000000000001`);
    expect(principal.kind).toBe('person');
    expect(principal.name).toBe('Alice Andrade');
    expect(principal.username).toBe('alice@example.org');
  });

  test('groups are read as lower-cased object ids from the configured claim', () => {
    const principal = normalizeClaims(
      entraClaims({ groups: ['7D1F3A52-2C4E-4B8A-9A61-0F3C5E2B1A01'] }),
      entra,
    );
    expect(principal.groups).toEqual(['7d1f3a52-2c4e-4b8a-9a61-0f3c5e2b1a01']);
    expect(principal.groupsResolved).toBe('token');
    expect(principal.groupOverage).toBe(false);
    const custom = normalizeClaims(entraClaims({ wids: ['x'], teams: ['abc'] }), {
      ...entra,
      groupClaim: 'teams',
    });
    expect(custom.groups).toEqual(['abc']);
  });

  test('group overage through hasgroups or claim sources leaves groups to the directory', () => {
    for (const overage of [
      { hasgroups: true },
      { _claim_names: { groups: 'src1' }, _claim_sources: { src1: { endpoint: 'x' } } },
    ]) {
      const principal = normalizeClaims(entraClaims(overage), entra);
      expect(principal.groupOverage).toBe(true);
      expect(principal.groups).toEqual([]);
      expect(principal.groupsResolved).toBe('failed');
    }
  });

  test('an application token becomes a client keyed by its client id', () => {
    const principal = normalizeClaims(
      { ...entraClaims(), idtyp: 'app', azp: 'sw-agent', name: undefined },
      entra,
    );
    expect(principal.kind).toBe('client');
    expect(principal.id).toBe('client:sw-agent');
    expect(principal.clientId).toBe('sw-agent');
    const version1 = normalizeClaims({ ...entraClaims(), idtyp: 'app', appid: 'sw-old' }, entra);
    expect(version1.id).toBe('client:sw-old');
  });

  test('app roles in the token are ignored for people', () => {
    const principal = normalizeClaims(entraClaims({ roles: ['Admin'] }), entra);
    expect(JSON.stringify(principal)).not.toContain('Admin');
  });
});

describe('Entra verified address', () => {
  test('the e-mail claim counts only when Entra marks its domain as verified', () => {
    const verified = normalizeClaims(
      entraClaims({ email: ' Bob@Example.org ', xms_edov: true, preferred_username: 'b' }),
      entra,
    );
    expect(verified.verifiedEmail).toBe('bob@example.org');
    const unmarked = normalizeClaims(
      entraClaims({ email: 'someone@else.example', preferred_username: 'alice@example.org' }),
      entra,
    );
    expect(unmarked.verifiedEmail).toBe('alice@example.org');
  });

  test('without a verified e-mail claim the user principal name is the address', () => {
    expect(normalizeClaims(entraClaims({ upn: 'Alice@Example.org' }), entra).verifiedEmail).toBe(
      'alice@example.org',
    );
    expect(normalizeClaims(entraClaims(), entra).verifiedEmail).toBe('alice@example.org');
  });

  test('a guest user principal name is never used as an address', () => {
    const guest = normalizeClaims(
      entraClaims({
        email: 'gina@partner.example',
        upn: 'gina_partner.example#EXT#@workbenchtest.onmicrosoft.com',
        preferred_username: 'gina_partner.example#ext#@workbenchtest.onmicrosoft.com',
      }),
      entra,
    );
    expect(guest.verifiedEmail).toBeNull();
  });

  test('a user principal name that is not an address gives no address', () => {
    expect(
      normalizeClaims(entraClaims({ preferred_username: 'alice' }), entra).verifiedEmail,
    ).toBeNull();
  });
});

describe('Keycloak and generic claims', () => {
  test('the stable id is issuer and subject', () => {
    const principal = normalizeClaims({ iss: issuer, sub: 'f00d', name: 'Alice' }, keycloak);
    expect(principal.id).toBe(`${issuer}|f00d`);
  });

  test('the e-mail counts only when e-mail verified is true', () => {
    const claims = { iss: issuer, sub: 's', email: 'Gina@Partner.example' };
    expect(normalizeClaims({ ...claims, email_verified: true }, keycloak).verifiedEmail).toBe(
      'gina@partner.example',
    );
    expect(
      normalizeClaims({ ...claims, email_verified: false }, keycloak).verifiedEmail,
    ).toBeNull();
    expect(
      normalizeClaims({ ...claims, email_verified: 'true' }, keycloak).verifiedEmail,
    ).toBeNull();
    expect(normalizeClaims(claims, generic).verifiedEmail).toBeNull();
  });

  test('group names and paths are kept exactly as the provider sends them', () => {
    const principal = normalizeClaims(
      { iss: issuer, sub: 's', groups: ['Sales Editors', '/Finance/Controllers'] },
      keycloak,
    );
    expect(principal.groups).toEqual(['Sales Editors', '/Finance/Controllers']);
  });

  test('client roles are ignored', () => {
    const principal = normalizeClaims(
      { iss: issuer, sub: 's', resource_access: { 'semantic-workbench': { roles: ['admin'] } } },
      keycloak,
    );
    expect(JSON.stringify(principal)).not.toContain('admin');
  });

  test('the username falls back from preferred username to e-mail to subject', () => {
    expect(
      normalizeClaims({ iss: issuer, sub: 's', preferred_username: 'al' }, generic).username,
    ).toBe('al');
    expect(normalizeClaims({ iss: issuer, sub: 's' }, generic).username).toBe('s');
  });

  test('claims that are not strings are ignored rather than trusted', () => {
    const principal = normalizeClaims(
      { iss: issuer, sub: 's', groups: ['a', 7, null], email: 5, email_verified: true },
      generic,
    );
    expect(principal.groups).toEqual(['a']);
    expect(principal.verifiedEmail).toBeNull();
  });

  test('a token without issuer or subject is refused', () => {
    expect(() => normalizeClaims({ sub: 's' }, generic)).toThrow();
    expect(() => normalizeClaims({ iss: issuer }, generic)).toThrow();
    expect(() => normalizeClaims(entraClaims({ oid: undefined }), entra)).toThrow();
  });
});

describe('principal keys and the local principal', () => {
  test('the key is u and twenty hex digits of the id hash', () => {
    const key = principalKey('tenant:object');
    expect(key).toMatch(/^u[0-9a-f]{20}$/);
    expect(principalKey('tenant:object')).toBe(key);
    expect(principalKey('tenant:other')).not.toBe(key);
  });

  test('local mode has one implicit principal that holds the Admin role', () => {
    const local = localPrincipal();
    expect(local.id).toBe('local');
    expect(local.kind).toBe('local');
    expect(local.grants).toEqual([
      { grantId: 'local', roleId: 'admin', scope: { kind: 'workspace' }, via: 'local' },
    ]);
    expect(local.deactivated).toBe(false);
  });
});
