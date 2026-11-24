// Checks the revision change touches only the marker: raising a number in place, adding the marker first, and leaving a document that already declares revision 2.
import { expect, test } from 'bun:test';
import { revisionNeed, withRevision } from '../../src/shared/tessera/revision-edit';
import { validateInput } from '../../src/shared/validation/input';

const BODY = 'version: 0.2.0.dev0\nname: Retail\n# kept comment\nontology:\n  - concept: Order\n    type: EntityType\n';

test('a document at revision 1 is raised and only that line changes', () => {
  const source = `tessera: 1\n${BODY}`;
  expect(revisionNeed(source)).toBe('raise');
  expect(withRevision(source, 'a.yaml')).toBe(`tessera: 2\n${BODY}`);
});

test('an unmarked document gets the marker as its first line', () => {
  expect(revisionNeed(BODY)).toBe('mark');
  expect(withRevision(BODY, 'a.yaml')).toBe(`tessera: 2\n${BODY}`);
  expect(validateInput(withRevision(BODY, 'a.yaml'), 'a.ontology.yaml').valid).toBe(true);
});

test('a document at revision 2 or higher is left alone', () => {
  const source = `tessera: 2\n${BODY}`;
  expect(revisionNeed(source)).toBe('none');
  expect(withRevision(source, 'a.yaml')).toBe(source);
  expect(revisionNeed('tessera: 3\nname: x\n')).toBe('none');
});

test('windows line endings are kept when the marker is added', () => {
  const source = BODY.replaceAll('\n', '\r\n');
  expect(withRevision(source, 'a.yaml')).toBe(`tessera: 2\r\n${source}`);
});

test('a JSON document is marked through the patch writer', () => {
  const source = '{"version": "0.2.0.dev0", "name": "Retail", "ontology": [{"concept": "Order", "type": "EntityType"}]}';
  const marked = withRevision(source, 'a.json');
  expect(JSON.parse(marked).tessera).toBe(2);
  expect(JSON.parse(marked).name).toBe('Retail');
});

test('text that is not a document needs nothing', () => {
  expect(revisionNeed('::: not yaml :::\n\t-')).toBe('none');
});
