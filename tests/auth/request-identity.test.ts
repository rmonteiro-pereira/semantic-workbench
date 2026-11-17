// Every identity symbol reaches handlers through the same attachment function.
import { expect, test } from 'bun:test';
import * as identity from '../../src/server/auth/request-scope';
import { requestAuditId, requestSourceIp } from '../../src/server/request';
import { createAccessControl } from '../../src/server/auth/authorize';
import { localPrincipal } from '../../src/server/auth/principal';
import { accessFixture } from './access-fixture';

test('identity attachment sets every exported identity symbol', () => {
  const principal = localPrincipal();
  const scope = createAccessControl({ ...accessFixture(), mode: 'local' }).forRequest(principal);
  const request = new Request('http://operation.internal/api/projects') as identity.AccessRequest;
  request[identity.requestPublication] = { previous: null, commit: 'a'.repeat(40) };
  request[identity.requestPublicationRefusal] = 'changed';
  identity.attachIdentity(
    request,
    { principal, origin: 'mcp', sourceIp: '127.0.0.2', session: null },
    {
      scope,
      requestId: 'identity-test',
      remote: 'local',
      auditProjects: null,
    },
  );
  const symbols = [...Object.values(identity).filter(value => typeof value === 'symbol'), requestAuditId, requestSourceIp];
  for (const symbol of symbols) expect(Object.hasOwn(request, symbol), symbol.toString()).toBe(true);
  expect(request[identity.requestAccess]).toBe(scope);
  expect(request[requestAuditId]).toBe('identity-test');
  expect(request[requestSourceIp]).toBe('127.0.0.2');
  expect(request[identity.requestRemote]).toBe('local');
  expect(request[identity.requestAuditProjects]).toBeNull();
  expect(request[identity.requestSession]).toBeNull();
  expect(request[identity.requestPublication]).toBeUndefined();
  expect(request[identity.requestPublicationRefusal]).toBeUndefined();
  expect(identity.requestReader(request)).toBeDefined();
});
