// Checks the revision question: what it says for each document, that Cancel offers no write, and that confirming raises the number in the same text as the change.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { renderToStaticMarkup } from 'react-dom/server';
import { RevisionDialog, revisionQuestion } from '../../src/app/edit/RevisionConfirmation';
import { planReorderAttributes } from '../../src/app/attributes/attribute-save';
import { withRevision } from '../../src/shared/tessera/revision-edit';

const OLDER =
  'tessera: 1\nversion: 0.2.0.dev0\nname: Retail\nontology:\n  - concept: Customer\n    type: EntityType\n    relationships:\n      - name: email\n        roles: [{concept: String}]\n        verbalizes: [Customer has email]\n      - name: phone\n        roles: [{concept: String}]\n        verbalizes: [Customer has phone]\n';
const doc = { id: 'p/a.yaml', path: 'a.yaml', filename: 'a.yaml', source: OLDER };

test('a document at revision 1 is asked to move and the dialog explains the cost', () => {
  const question = revisionQuestion(OLDER)!;
  const html = renderToStaticMarkup(<RevisionDialog question={question} busy={false} onCancel={() => {}} onConfirm={() => {}} />);
  expect(html).toContain('Move this file to Tessera 2?');
  expect(html).toContain('Workbenches that only know revision 1 cannot open the file');
  expect(html).toContain('Cancel');
});

test('an unmarked document is asked to be marked first', () => {
  const question = revisionQuestion(OLDER.replace('tessera: 1\n', ''))!;
  expect(question.confirm).toBe('Mark as Tessera 2');
  expect(question.body).toContain('line at its top');
});

test('confirming writes the raised marker and the list in one text, and declining writes nothing', () => {
  const confirmed = planReorderAttributes(doc, ['ontology', 0], ['phone', 'email'], text => withRevision(text, 'a.yaml'));
  if ('refusal' in confirmed) throw new Error(confirmed.refusal);
  expect(confirmed.writes[0].source.startsWith('tessera: 2\n')).toBe(true);
  expect(parse(confirmed.writes[0].source).ontology[0].tessera_attributes).toEqual(['phone', 'email']);
  expect(doc.source).toBe(OLDER);
});
