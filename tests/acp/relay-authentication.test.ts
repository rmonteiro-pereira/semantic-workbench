// The local relay check accepts only a request with no Origin, an exact loopback Host and the capability.
import { expect, test } from 'bun:test';
import { createLocalRelayAuthenticator } from '../../src/server/acp/relay-authentication';

const authenticate = createLocalRelayAuthenticator({ capability: { matches: value => value === 'good-capability' }, port: 4310 });
const request = (headers: Record<string, string>) => new Request('http://127.0.0.1:4310/api/acp/relay/x/hello', { method: 'POST', headers });

test('a relay with the capability, a loopback Host and no Origin is the local person', async () => {
  for (const host of ['127.0.0.1:4310', 'localhost:4310', 'LOCALHOST:4310', '[::1]:4310']) {
    const result = await authenticate(request({ host, authorization: 'Bearer good-capability' }));
    expect(result.ok, host).toBe(true);
  }
});

test('anything else is refused without saying why', async () => {
  const refused: Record<string, string>[] = [
    { host: '127.0.0.1:4310' },
    { host: '127.0.0.1:4310', authorization: 'Bearer wrong' },
    { host: '127.0.0.1:4310', authorization: 'Basic good-capability' },
    { host: '127.0.0.1:4310', authorization: 'good-capability' },
    { host: '127.0.0.1:4310', authorization: 'Bearer good-capability', origin: 'http://127.0.0.1:4310' },
    { host: '127.0.0.1:4310', authorization: 'Bearer good-capability', origin: 'null' },
    { host: 'evil.example', authorization: 'Bearer good-capability' },
    { host: '127.0.0.1:9999', authorization: 'Bearer good-capability' },
    { host: '127.0.0.1', authorization: 'Bearer good-capability' },
  ];
  for (const headers of refused) expect(await authenticate(request(headers)), JSON.stringify(headers)).toEqual({ ok: false });
});
