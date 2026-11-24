// Every state transition and every end reason of a panel session, driven by a clock the test passes in.
import { expect, test } from 'bun:test';
import {
  END_REASONS,
  ENDED_RETENTION_MS,
  IDLE_LIMIT_MS,
  RELAY_GRACE_MS,
  WAITING_LIMIT_MS,
  applyEvent,
  endDueAt,
  newPanelSession,
  retentionOver,
  type EndReason,
  type PanelSessionState,
  type SessionEvent,
} from '../../src/server/acp/panel-session';

function connected(): PanelSessionState {
  return applyEvent(newPanelSession(0), { type: 'connect' }, 1_000);
}
function working(): PanelSessionState {
  return applyEvent(connected(), { type: 'prompt' }, 2_000);
}

test('a new session waits and a connect makes it connected', () => {
  expect(newPanelSession(5).state).toBe('waiting');
  expect(connected().state).toBe('connected');
});

test('a prompt starts work and a finished turn returns to connected', () => {
  expect(working().state).toBe('working');
  expect(applyEvent(working(), { type: 'turn-finished' }, 3_000).state).toBe('connected');
});

const noEffect: [string, PanelSessionState, SessionEvent][] = [
  ['prompt while waiting', newPanelSession(0), { type: 'prompt' }],
  ['turn finished while connected', connected(), { type: 'turn-finished' }],
  ['connect twice', connected(), { type: 'connect' }],
  ['prompt while working', working(), { type: 'prompt' }],
  ['activity while waiting', newPanelSession(0), { type: 'activity' }],
  ['link lost while waiting', newPanelSession(0), { type: 'link-lost' }],
  ['link restored when never lost', connected(), { type: 'link-restored' }],
];
for (const [name, session, event] of noEffect) {
  test(`${name} changes nothing`, () => {
    expect(applyEvent(session, event, 9_000)).toBe(session);
  });
}

test('activity moves the idle clock and a lost link keeps its first time', () => {
  const active = applyEvent(connected(), { type: 'activity' }, 50_000);
  expect(active.lastActivityAt).toBe(50_000);
  const lost = applyEvent(active, { type: 'link-lost' }, 60_000);
  expect(applyEvent(lost, { type: 'link-lost' }, 70_000).linkLostAt).toBe(60_000);
  expect(applyEvent(lost, { type: 'link-restored' }, 70_000).linkLostAt).toBeUndefined();
});

test('every end reason ends a session from every live state', () => {
  const live = [newPanelSession(0), connected(), working()];
  for (const reason of END_REASONS) {
    for (const session of live) {
      const result = applyEvent(session, { type: 'end', reason }, 100_000);
      expect(result.state).toBe('ended');
      expect(result.endReason).toBe(reason);
      expect(result.endedAt).toBe(100_000);
    }
  }
  expect(END_REASONS).toHaveLength(13);
});

test('an ended session accepts no further transition', () => {
  const events: SessionEvent[] = [
    { type: 'connect' },
    { type: 'prompt' },
    { type: 'turn-finished' },
    { type: 'activity' },
    { type: 'link-lost' },
    { type: 'link-restored' },
    ...END_REASONS.map((reason): SessionEvent => ({ type: 'end', reason })),
  ];
  const done = applyEvent(working(), { type: 'end', reason: 'closed' }, 5_000);
  for (const event of events) expect(applyEvent(done, event, 9_000)).toBe(done);
  expect(endDueAt(done, 10 ** 12)).toBeUndefined();
});

test('the clock ends a waiting session after the waiting limit', () => {
  const waiting = newPanelSession(1_000);
  expect(endDueAt(waiting, 1_000 + WAITING_LIMIT_MS - 1)).toBeUndefined();
  expect(endDueAt(waiting, 1_000 + WAITING_LIMIT_MS)).toBe('no-agent');
});

test('the clock ends a quiet connected or working session after the idle limit', () => {
  for (const session of [connected(), working()]) {
    expect(endDueAt(session, session.lastActivityAt + IDLE_LIMIT_MS - 1)).toBeUndefined();
    expect(endDueAt(session, session.lastActivityAt + IDLE_LIMIT_MS)).toBe('idle');
  }
});

test('a relay that stays away past the grace ends the session with relay-lost, whatever else is due', () => {
  const lost = applyEvent(working(), { type: 'link-lost' }, 10_000);
  expect(endDueAt(lost, 10_000 + RELAY_GRACE_MS - 1)).toBeUndefined();
  expect(endDueAt(lost, 10_000 + RELAY_GRACE_MS)).toBe('relay-lost');
  expect(endDueAt(lost, 10_000 + IDLE_LIMIT_MS + 1)).toBe('relay-lost');
});

test('the clock alone produces exactly the reasons no-agent, idle and relay-lost', () => {
  const produced = new Set<EndReason>();
  const waiting = newPanelSession(0);
  produced.add(endDueAt(waiting, WAITING_LIMIT_MS)!);
  produced.add(endDueAt(connected(), 1_000 + IDLE_LIMIT_MS)!);
  produced.add(endDueAt(applyEvent(connected(), { type: 'link-lost' }, 2_000), 2_000 + RELAY_GRACE_MS)!);
  expect([...produced].sort()).toEqual(['idle', 'no-agent', 'relay-lost']);
});

test('an ended session is dropped after the retention period', () => {
  const done = applyEvent(connected(), { type: 'end', reason: 'closed' }, 5_000);
  expect(retentionOver(done, 5_000 + ENDED_RETENTION_MS - 1)).toBe(false);
  expect(retentionOver(done, 5_000 + ENDED_RETENTION_MS)).toBe(true);
  expect(retentionOver(connected(), 10 ** 12)).toBe(false);
});
