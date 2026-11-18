// Checks lifetimes, single use, replay recognition, caps and session binding of the memory stores.
import { expect, test } from 'bun:test';
import {
  CODE_LIFETIME_MS,
  MAX_ISSUED_GRANTS,
  MAX_PENDING_REQUESTS,
  PENDING_REQUEST_LIFETIME_MS,
  SETUP_CREDENTIAL_LIFETIME_MS,
  SETUP_CREDENTIAL_PREFIX,
  createPendingGrants,
  type GrantBinding,
} from '../../src/server/connections/pending-grants';
import { deriveConnectionKey } from '../../src/server/connections/token-keys';

const key = deriveConnectionKey(new Uint8Array(32).fill(1));

function fixture() {
  let clock = 1_000_000;
  const store = createPendingGrants({ key, now: () => clock });
  return { store, advance: (milliseconds: number) => (clock += milliseconds) };
}

const request = {
  clientId: 'client-one',
  redirectUri: 'http://127.0.0.1:1/cb',
  scopes: ['read' as const],
  codeChallenge: 'c'.repeat(43),
  resource: 'https://wb.example/api/mcp',
  sessionReference: 'session-a',
};
const code: GrantBinding = {
  kind: 'code',
  clientId: 'client-one',
  redirectUri: request.redirectUri,
  scopes: ['read'],
  resource: request.resource,
  codeChallenge: request.codeChallenge,
  person: 'alice',
  sessionReference: 'session-a',
  origin: 'mcp',
};
const setup: GrantBinding = { kind: 'setup', clientId: 'client-one', scopes: ['read'], resource: request.resource, person: 'alice', sessionReference: 'session-a', origin: 'mcp' };

test('a request is taken once and only by the session that opened it', () => {
  const { store } = fixture();
  const created = store.createRequest(request);
  expect(store.takeRequest(created.id, 'session-b')).toBeNull();
  expect(store.takeRequest(created.id, 'session-a')?.clientId).toBe('client-one');
  expect(store.takeRequest(created.id, 'session-a')).toBeNull();
});

test('a request expires after ten minutes', () => {
  const { store, advance } = fixture();
  const created = store.createRequest(request);
  advance(PENDING_REQUEST_LIFETIME_MS - 1);
  expect(store.peekRequest(created.id, 'session-a')).not.toBeNull();
  advance(1);
  expect(store.peekRequest(created.id, 'session-a')).toBeNull();
});

test('the cap drops the oldest requests', () => {
  const { store } = fixture();
  const first = store.createRequest(request);
  for (let index = 0; index < MAX_PENDING_REQUESTS; index++) store.createRequest(request);
  expect(store.sizes().requests).toBe(MAX_PENDING_REQUESTS);
  expect(store.peekRequest(first.id, 'session-a')).toBeNull();
});

test('a code is fresh once and then recognised as a replay with its connection', () => {
  const { store } = fixture();
  const { value } = store.issue(code);
  const first = store.present(value);
  expect(first.state).toBe('fresh');
  if (first.state === 'fresh') first.attachConnection('connection-1');
  const second = store.present(value);
  expect(second).toMatchObject({ state: 'replayed', connectionId: 'connection-1' });
});

test('an unknown value is unknown', () => {
  const { store } = fixture();
  expect(store.present('nothing')).toEqual({ state: 'unknown' });
});

test('a code lives one minute and a setup credential ten', () => {
  const { store, advance } = fixture();
  const issuedCode = store.issue(code);
  const issuedSetup = store.issue(setup);
  expect(issuedSetup.value.startsWith(SETUP_CREDENTIAL_PREFIX)).toBe(true);
  expect(issuedCode.value.startsWith(SETUP_CREDENTIAL_PREFIX)).toBe(false);
  advance(CODE_LIFETIME_MS);
  expect(store.present(issuedCode.value).state).toBe('unknown');
  expect(store.present(issuedSetup.value).state).toBe('fresh');
  advance(SETUP_CREDENTIAL_LIFETIME_MS);
  expect(store.present(issuedSetup.value).state).toBe('unknown');
});

test('a spent code stops being a replay once it would have expired', () => {
  const { store, advance } = fixture();
  const { value } = store.issue(code);
  store.present(value);
  advance(CODE_LIFETIME_MS);
  expect(store.present(value).state).toBe('unknown');
});

test('the cap drops the oldest grants', () => {
  const { store } = fixture();
  const first = store.issue(code);
  for (let index = 0; index < MAX_ISSUED_GRANTS; index++) store.issue(code);
  expect(store.sizes().grants).toBe(MAX_ISSUED_GRANTS);
  expect(store.present(first.value).state).toBe('unknown');
});

test('ending a session forgets its requests, codes and credentials', () => {
  const { store } = fixture();
  const created = store.createRequest(request);
  const issued = store.issue(code);
  const other = store.issue({ ...code, sessionReference: 'session-b' });
  store.dropSession('session-a');
  expect(store.peekRequest(created.id, 'session-a')).toBeNull();
  expect(store.present(issued.value).state).toBe('unknown');
  expect(store.present(other.value).state).toBe('fresh');
});
