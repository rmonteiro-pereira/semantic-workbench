// Relay refusals leave bounded audit records without copying protocol content or credentials.
import { expect, test, spyOn } from 'bun:test';
import { log } from '../../src/server/observability/log';
import * as metrics from '../../src/server/observability/metrics';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startPanelServer } from './helpers/panel-server';

const canary = 'untrusted-protocol-content-canary';

test('bad credentials and foreign origins are audited through the anonymous gate', async () => {
  const server = await startPanelServer();
  const logged = spyOn(log, 'info');
  const measured = spyOn(metrics, 'recordOperation');
  try {
    const { body } = await server.startSession();
    const attempts: Record<string, string>[] = [{ authorization: `Bearer ${canary}` }, { origin: 'https://foreign.test' }, { host: 'foreign.test' }];
    for (const headers of attempts) {
      const refused = await server.relay(`/api/acp/relay/${body.id}/hello`, { method: 'POST', headers, json: { code: canary } });
      expect(refused.status).toBe(404);
    }
    const records = readdirSync(join(server.root, 'state', 'audit'))
      .filter(name => name.endsWith('.jsonl'))
      .map(name => readFileSync(join(server.root, 'state', 'audit', name), 'utf8'))
      .join('');
    expect(records).toContain('relay-refused');
    expect(records).toContain('"origin":"acp"');
    expect(records).not.toContain(canary);
    expect(records).not.toContain(server.capability());
    expect(records).not.toContain(body.code);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(measured.mock.calls)).not.toContain(canary);
    for (let index = 0; index < 30; index++) await server.relay(`/api/acp/relay/${body.id}/hello`, { method: 'POST', bearer: canary, json: { code: canary } });
    const bounded = readdirSync(join(server.root, 'state', 'audit'))
      .filter(name => name.endsWith('.jsonl'))
      .map(name => readFileSync(join(server.root, 'state', 'audit', name), 'utf8'))
      .join('');
    expect(bounded.match(/relay-refused/g)?.length).toBe(20);
  } finally {
    logged.mockRestore();
    measured.mockRestore();
    await server.close();
  }
});

test('unsupported methods are recorded by class without the method or its parameters', async () => {
  const server = await startPanelServer();
  try {
    const { body } = await server.startSession();
    await server.relay(`/api/acp/relay/${body.id}/hello`, { method: 'POST', json: { code: body.code } });
    await server.relay(`/api/acp/relay/${body.id}/frames`, {
      method: 'POST',
      json: {
        frames: [
          { seq: 1, payload: JSON.stringify({ jsonrpc: '2.0', id: 'terminal', method: `terminal/${canary}`, params: { text: canary } }) },
          { seq: 2, payload: JSON.stringify({ jsonrpc: '2.0', id: 'other', method: canary, params: { text: canary } }) },
        ],
      },
    });
    await Bun.sleep(20);
    const records = readdirSync(join(server.root, 'state', 'audit'))
      .filter(name => name.endsWith('.jsonl'))
      .map(name => readFileSync(join(server.root, 'state', 'audit', name), 'utf8'))
      .join('');
    expect(records).toContain('unsupported-terminal');
    expect(records).toContain('unsupported-other');
    expect(records).not.toContain(canary);
    const session = server.service.store.findForRelay(body.id)!;
    expect(
      session.link
        .replayAfter(0)
        .map(frame => frame.payload)
        .join(''),
    ).toContain('Method not found.');
  } finally {
    await server.close();
  }
});
