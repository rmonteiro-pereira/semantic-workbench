import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { AgentConnections, ConnectionListView } from '../src/app/auth/AgentConnectionsDialog';
import type { ConnectionView } from '../src/app/auth/connection-api';

const connection: ConnectionView = {
  origin: 'acp',
  id: 'connection',
  clientId: 'client',
  programName: 'Long program '.repeat(80),
  personName: 'A person',
  scopes: ['read'],
  createdAt: '2026-11-17',
  lastUsedAt: '2026-11-17',
  state: 'active',
};

test('the connection list preserves long names, explicit state and empty state', () => {
  expect(renderToStaticMarkup(<ConnectionListView connections={[]} administrator={false} onRevoke={() => {}} />)).toContain('No agent connections.');
  const html = renderToStaticMarkup(<ConnectionListView connections={[connection]} administrator={true} onRevoke={() => {}} />);
  expect(html).toContain(connection.programName);
  expect(html).toContain('Connected through: the agent panel');
  expect(html).toContain('A person');
  expect(html).toContain('Status: active');
  expect(html).toContain('Revoke ');
  expect(renderToStaticMarkup(<AgentConnections />)).toContain('Loading connections');
});

test('ended connections explain why and offer no revoke action', () => {
  const html = renderToStaticMarkup(<ConnectionListView connections={[{ ...connection, state: 'ended', endReason: 'expired' }]} administrator={false} onRevoke={() => {}} />);
  expect(html).toContain('ended (expired)');
  expect(html).not.toContain('<button');
  const css = readFileSync(new URL('../src/app/auth/AgentConnectionsDialog.css', import.meta.url), 'utf8');
  expect(css).toContain('overflow-wrap: anywhere');
  expect(css).not.toMatch(/text-overflow|line-clamp|nowrap/);
});
