// Checks cross-document invariants at the single configuration validation boundary.
import { expect, test } from 'bun:test';
import { validateAccessConfig, AccessConfigError } from '../../src/server/auth/access-config';
import { accessFixture } from './access-fixture';

test('duplicate grant ids and equivalent assignments are refused', () => {
  const config = accessFixture().config;
  const grant = structuredClone(config.grants[0]);
  config.grants.push(grant);
  expect(() => validateAccessConfig(config)).toThrow(AccessConfigError);
  grant.id = 'another';
  expect(() => validateAccessConfig(config)).toThrow('duplicate assignment');
});
test('grant references and Admin scopes are validated before activation', () => {
  for (const change of ['role', 'project', 'domain', 'admin', 'project-domain']) {
    const config = accessFixture().config;
    const grant = config.grants[0];
    if (change === 'role') grant.roleId = 'r_unknown';
    if (change === 'project') grant.scope = { kind: 'projects', projects: ['unknown'] };
    if (change === 'domain') grant.scope = { kind: 'domains', domains: ['unknown'] };
    if (change === 'admin') {
      grant.roleId = 'admin';
      grant.scope = { kind: 'domains', domains: ['sales'] };
    }
    if (change === 'project-domain') config.projects.projects['sales-contracts'].domain = 'unknown';
    expect(() => validateAccessConfig(config)).toThrow(AccessConfigError);
  }
});
test('custom role names are unique regardless of case and built-in ids cannot be redefined', () => {
  const config = accessFixture().config;
  config.roles.push({
    ...config.roles[0],
    id: 'r_another',
    name: config.roles[0].name.toUpperCase(),
  });
  expect(() => validateAccessConfig(config)).toThrow(AccessConfigError);
  config.roles.pop();
  config.roles[0].id = 'admin';
  expect(() => validateAccessConfig(config)).toThrow(AccessConfigError);
});

test('email assignments are duplicate regardless of address case', () => {
  const config = accessFixture().config;
  const grant = config.grants[0];
  grant.member = { kind: 'email', email: 'A@x.org' };
  config.grants.push({
    ...grant,
    id: 'another-email',
    member: { kind: 'email', email: 'a@x.org' },
  });
  expect(() => validateAccessConfig(config)).toThrow(AccessConfigError);
  grant.member.email = 'a@x.org';
  expect(() => validateAccessConfig(config)).toThrow('duplicate assignment');
});
