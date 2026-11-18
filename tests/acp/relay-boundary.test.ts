// Relay transport rows retain authorization even though authentication is inside their adapter.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAuditLog } from '../../src/server/auth/audit';
import { createAccessControl } from '../../src/server/auth/authorize';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { authWorkspace } from '../helpers/auth-workspace';
import { accessFixture, person } from '../auth/access-fixture';
import { testDoubleConnections } from './helpers/connection-double';
import type { PanelService } from '../../src/server/acp/panel-service';
import type { Session } from '../../src/server/auth/sessions';

for (const allowed of [true, false]) {
  test(`authenticated relay transport uses the boundary when workspace read is ${allowed ? 'allowed' : 'refused'}`, async () => {
    using fixture = await authWorkspace();
    const access = createAccessControl(accessFixture());
    const principal = access.principalFor(person(allowed ? 'dave' : 'erin'));
    const connections = testDoubleConnections();
    const audit = createAuditLog({ dir: join(fixture.root, 'relay-audit') });
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      access,
      audit,
      remoteCredentials: allowEveryRemote(),
      port: 5415,
      publicOrigin: 'https://workbench.test',
      acp: { connections: connections.directory },
    });
    const service = (handler as typeof handler & { agentPanel: PanelService }).agentPanel;
    try {
      const started = await service.start({ principal, session: { principal } as Session });
      if (!started.ok) throw new Error(started.error);
      const credential = /SW_ACP_CREDENTIAL=([^ ]+)/.exec(started.session.command)![1];
      const token = connections.exchange(credential)!;
      const base = `https://workbench.test/api/acp/relay/${started.session.id}`;
      const response = await handler(
        new Request(`${base}/hello`, { method: 'POST', headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ code: started.session.code }) }),
      );
      expect(response.status).toBe(allowed ? 200 : 403);
      const record = audit.recent(20).find(entry => entry.tool === 'agentRelay.hello');
      expect(record).toMatchObject({ origin: 'acp', connection: token.connection, decision: allowed ? 'allow' : 'deny' });
      expect(service.store.findForRelay(started.session.id)!.code === undefined).toBe(allowed);
    } finally {
      service.stopSweeper();
      service.endAllOf(principal.id, 'closed');
    }
  }, 30_000);
}
