// Production authentication supplies one configured log to handlers and administration.
import { expect, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as auditModule from '../../src/server/auth/audit';
import { createServerAuthentication } from '../../src/server/auth/authentication';
import { createOidcClient } from '../../src/server/auth/oidc';
import { createHandler } from '../../src/server/handler';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { person } from './access-fixture';
import { authWorkspace } from '../helpers/auth-workspace';
import { oidcTransport } from '../helpers/oidc-transport';

test('configured retention reaches the sole shared production audit constructor', async () => {
  using fixture = await authWorkspace();
  const settingsFile = join(fixture.root, 'admin/settings.json');
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
  settings.audit.retentionDays = 30;
  writeFileSync(settingsFile, JSON.stringify(settings));
  const auditDir = join(fixture.root, 'state/audit');
  mkdirSync(auditDir, { recursive: true });
  const old = new Date(Date.now() - 150 * 86400000).toISOString().slice(0, 7) + '.jsonl';
  writeFileSync(join(auditDir, old), 'old retained record\n');
  const transport = await oidcTransport();
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const constructor = spyOn(auditModule, 'createAuditLog');
  const mirror = spyOn(console, 'log').mockImplementation(() => {});
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  try {
    const handler = createHandler(fixture.ws, auth);
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(constructor.mock.calls[0][0].retentionDays).toBe(30);
    expect(typeof constructor.mock.calls[0][0].mirror).toBe('function');
    expect(existsSync(join(auditDir, old))).toBe(false);
    const caller = mintCaller({ principal: auth.access.principalFor(person('dave')), origin: 'mcp' });
    await handler.boundary.operate({ caller, request: buildTwinRequest('projects.list', { params: {} }) });
    expect(auth.audit.recent(10)).toHaveLength(1);
    expect(mirror).toHaveBeenCalledTimes(1);
    expect(auditModule.verifyAuditChain(auditModule.readStoredMonths(auditDir)).ok).toBe(true);
    expect(constructor).toHaveBeenCalledTimes(1);
  } finally {
    auth.close();
    constructor.mockRestore();
    mirror.mockRestore();
  }
});
