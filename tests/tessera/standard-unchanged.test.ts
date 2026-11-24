// Proves ordinary Ossie and ODCS files give the same findings, items, addresses and agent context as before the Tessera format existed.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BASELINE_FILE, recordBaseline, type StandardBaseline } from '../../scripts/record-standard-baseline';

const recorded: StandardBaseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
const current = recordBaseline();

test('the recorded baseline covers every document of the example and fixture folders', () => {
  expect(Object.keys(current.documents)).toEqual(Object.keys(recorded.documents));
  expect(Object.keys(recorded.documents).length).toBeGreaterThan(30);
});

for (const [path, expected] of Object.entries(recorded.documents)) {
  test(`${path} gives the recorded findings and inspection`, () => {
    expect(current.documents[path]).toEqual(expected);
  });
}

test('every mapping gives the recorded agent context', () => {
  expect(current.agentContexts).toEqual(recorded.agentContexts);
  expect(Object.keys(recorded.agentContexts).length).toBeGreaterThan(5);
});
