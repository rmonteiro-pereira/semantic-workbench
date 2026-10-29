/** Cursor navigation shared by the editor controls and imperative API. */
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** Selects the rest of a line and centers it, clamping to the document bounds. */
export function goToEditorLine(editorView: EditorView | null, line: number, column = 1) {
  if (!editorView) return;
  const targetLine = editorView.state.doc.line(Math.max(1, Math.min(editorView.state.doc.lines, line)));
  const position = Math.min(targetLine.to, targetLine.from + Math.max(0, column - 1));
  editorView.dispatch({
    selection: EditorSelection.range(targetLine.to > position ? targetLine.to : position, position),
    effects: EditorView.scrollIntoView(position, { y: 'center' }),
  });
  editorView.focus();
}
