// Checks what the Admin sees before confirming a change to the registered programs: added, changed and removed programs and the connections each change would end.
import { afterEach, expect, test } from 'bun:test';
import { connectionFixture, program } from '../connections/connection-fixture';

const fixtures: ReturnType<typeof connectionFixture>[] = [];
afterEach(() => fixtures.splice(0).forEach(fixture => fixture.cleanup()));
function open() {
  const fixture = connectionFixture();
  fixtures.push(fixture);
  return fixture;
}
async function connect(fixture: ReturnType<typeof open>, sessionId: string) {
  const session = fixture.signIn(sessionId);
  const outcome = await fixture.trade(fixture.codeFor(session));
  if (!outcome.ok) throw new Error('trade refused');
  return outcome;
}

test('the preview counts what a registration change would end', async () => {
  const fixture = open();
  await connect(fixture, 'session-one');
  await connect(fixture, 'session-two');
  const none = { formatVersion: 1 as const, programs: [] };
  expect(fixture.service.preview(none)).toMatchObject({ removed: [{ clientId: program.clientId }], endings: [{ clientId: program.clientId, connections: 2 }] });
  const renamed = { formatVersion: 1 as const, programs: [{ ...program, name: 'Renamed' }] };
  expect(fixture.service.preview(renamed)).toMatchObject({ changed: [{ clientId: program.clientId }], endings: [] });
  const narrowed = { formatVersion: 1 as const, programs: [{ ...program, scopes: ['read' as const] }] };
  expect(fixture.service.preview(narrowed).endings).toEqual([{ clientId: program.clientId, name: program.name, connections: 2 }]);
  const redirectGone = { formatVersion: 1 as const, programs: [{ ...program, redirectUris: ['http://127.0.0.1:1/other'] }] };
  expect(fixture.service.preview(redirectGone).endings[0].connections).toBe(2);
  const added = { formatVersion: 1 as const, programs: [program, { ...program, clientId: 'second-client' }] };
  expect(fixture.service.preview(added)).toMatchObject({ added: [{ clientId: 'second-client' }], endings: [] });
});
