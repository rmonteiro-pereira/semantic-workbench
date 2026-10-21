// Reads and edits CodeMirror content while preserving the file text represented by the editor.
import { expect, type Locator } from '@playwright/test';
// The source editor is CodeMirror, not a textarea: these helpers read the file text it stands for
// (exact bytes), replace it as one user edit, and read the selection.
/** Returns the exact file text represented by the CodeMirror editor. */
export const editorValue = (editor: Locator) =>
  editor.evaluate((el: any) => el.workbenchEditor.value() as string);
/** Replaces the editor text as one user edit. */
export async function fillEditor(editor: Locator, text: string) {
  await editor.evaluate((el: any, t: string) => {
    const v = el.workbenchEditor.view;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t }, userEvent: 'input' });
  }, text);
}
/** Waits for the editor to represent the expected file text. */
export async function expectEditorValue(
  editor: Locator,
  expected: string | RegExp,
  options: { timeout?: number; not?: boolean } = {},
) {
  const poll = expect.poll(() => editorValue(editor), { timeout: options.timeout ?? 5000 });
  if (typeof expected === 'string')
    await (options.not ? poll.not.toBe(expected) : poll.toBe(expected));
  else await (options.not ? poll.not.toMatch(expected) : poll.toMatch(expected));
}
/** Returns the editor selection through its browser test interface. */
export const editorSelection = (editor: Locator) =>
  editor.evaluate((el: any) => {
    const s = el.workbenchEditor.view.state;
    return s.sliceDoc(s.selection.main.from, s.selection.main.to) as string;
  });
