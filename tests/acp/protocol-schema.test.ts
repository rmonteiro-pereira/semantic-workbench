// The pinned protocol schema is the published file, unchanged, and every frame body the workbench uses has a working validator.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { ACP_PROTOCOL_VERSION, FRAME_DEFINITIONS, matchesDefinition } from '../../src/server/acp/protocol-schema';

const PINNED_SHA256 = 'e747a7bec3c02708b70885bf3cccac5c72fa421390dd7e85758fd61e33b1ae21';

test('the schema file is the published release byte for byte', () => {
  const bytes = readFileSync(new URL('../../schemas/acp-1.32.0.json', import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(PINNED_SHA256);
});

test('every definition the workbench uses compiles', () => {
  for (const definition of FRAME_DEFINITIONS) {
    expect(() => matchesDefinition(definition, {}), definition).not.toThrow();
  }
});

test('valid frame bodies pass and invalid ones fail', () => {
  expect(matchesDefinition('ReadTextFileRequest', { sessionId: 's', path: '/workbench/p/a.yaml' })).toBe(true);
  expect(matchesDefinition('ReadTextFileRequest', { sessionId: 's' })).toBe(false);
  expect(matchesDefinition('ReadTextFileRequest', { sessionId: 's', path: 3 })).toBe(false);
  expect(matchesDefinition('WriteTextFileRequest', { sessionId: 's', path: '/workbench/p/a.yaml', content: 'x' })).toBe(true);
  expect(matchesDefinition('WriteTextFileRequest', { sessionId: 's', path: '/workbench/p/a.yaml' })).toBe(false);
  expect(matchesDefinition('PromptResponse', { stopReason: 'end_turn' })).toBe(true);
  expect(matchesDefinition('PromptResponse', { stopReason: 'surprise' })).toBe(false);
  expect(matchesDefinition('InitializeRequest', { protocolVersion: ACP_PROTOCOL_VERSION, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false } })).toBe(true);
  expect(matchesDefinition('NewSessionRequest', { cwd: '/workbench', mcpServers: [] })).toBe(true);
  expect(matchesDefinition('NewSessionRequest', { cwd: '/workbench' })).toBe(false);
  expect(matchesDefinition('RequestPermissionResponse', { outcome: { outcome: 'selected', optionId: 'allow' } })).toBe(true);
  expect(matchesDefinition('RequestPermissionResponse', { outcome: { outcome: 'other' } })).toBe(false);
  expect(matchesDefinition('SessionNotification', { sessionId: 's', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } } })).toBe(true);
  expect(matchesDefinition('SessionNotification', { sessionId: 's', update: { sessionUpdate: 'plan', entries: [{ content: 'a', priority: 'high', status: 'pending' }] } })).toBe(true);
});
