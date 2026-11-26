// Line wrapping is opt-in: an editor made without the option keeps scrolling sideways as before.
import { expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { lineWrappingFor } from '../src/app/editor/useCodeMirror';

/** True when the editor's content carries CodeMirror's line-wrapping class. */
function wraps(state: EditorState): boolean {
  // Attributes can be fixed objects or functions of the view; line wrapping is a fixed object.
  return state.facet(EditorView.contentAttributes).some(attributes => typeof attributes !== 'function' && String(attributes.class ?? '').includes('cm-lineWrapping'));
}

test('an editor created without the option has no line-wrapping extension', () => {
  const state = EditorState.create({ doc: 'permit (principal, action, resource);', extensions: [lineWrappingFor(false)] });
  expect(wraps(state)).toBe(false);
});

test('an editor created with the option wraps its lines', () => {
  const state = EditorState.create({ doc: 'permit (principal, action, resource);', extensions: [lineWrappingFor(true)] });
  expect(wraps(state)).toBe(true);
});
