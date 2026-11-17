// The harness starts and stops twice without leaking a port, and a reference client reaches the mounted endpoint.
import { expect, test } from 'bun:test';
import { startLocalServer } from './helpers/local-server';

test('the harness starts and stops twice and frees its port', async () => {
  const ports: number[] = [];
  for (let round = 0; round < 2; round++) {
    const server = await startLocalServer();
    ports.push(server.port);
    const answer = await server.raw({ method: 'server/discover' });
    expect(answer.status).toBe(200);
    await server.close();
    await expect(fetch(`${server.url}/healthz`)).rejects.toThrow();
  }
  expect(ports[0]).toBeGreaterThan(0);
});

test('a reference client connects and lists the tools', async () => {
  const server = await startLocalServer();
  try {
    const client = await server.connect();
    const listed = await client.listTools();
    expect(Array.isArray(listed.tools)).toBe(true);
  } finally {
    await server.close();
  }
});
