/** Verifies indentation folding and persistent text boundary lookup. */
import { expect, test } from 'bun:test';
import { EditorState, Text } from '@codemirror/state';
import { foldService } from '@codemirror/language';
import { foldYamlBlock, findYamlLine } from '../src/editor/yamlIndentation';
import { languageFor } from '../src/editor/languages';

test('The installed fold service includes deeper lines and excludes following siblings', () => {
  const state = EditorState.create({
    doc: 'schema:\n  name: orders\n  properties:\n    amount: decimal\n\nnext: value',
    extensions: [languageFor('YAML', true)],
  });
  const service = state.facet(foldService)[0];
  expect(service(state, 0, 7)).toEqual({ from: 7, to: state.doc.line(4).to });
  expect(foldYamlBlock(state.doc, state.doc.line(2).from)).toBeNull();
  expect(foldYamlBlock(state.doc, state.doc.line(5).from)).toBeNull();
  expect(foldYamlBlock(state.doc, state.doc.line(6).from)).toBeNull();
});

test('Boundary searches reuse text branches correctly after an insertion', () => {
  const source = ['root:', ...Array(2000).fill('  child: value'), 'next: value'].join('\n');
  const doc = Text.of(source.split('\n'));
  expect(findYamlLine(doc, { from: 2, to: doc.lines, indentation: 0 })).toBe(2002);
  const updated = doc.replace(6, 6, Text.of(['other:', '']));
  expect(findYamlLine(updated, { from: 2, to: updated.lines, indentation: 0 })).toBe(2);
  expect(foldYamlBlock(updated, 0)).toBeNull();
});
