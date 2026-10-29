/** Shared visual and keyboard extensions for the source editor. */
import { keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { lintGutter, lintKeymap } from '@codemirror/lint';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { highlighting } from './languages';

/** Supplies the editor's gutters, highlighting, history and search panel. */
export function baseEditorExtensions() {
  return [
    lineNumbers(),
    foldGutter(),
    lintGutter(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    search({ top: true }),
    highlighting,
  ];
}

/** Gives Go to line priority over the search keymap's Mod-g binding. */
export function editorKeymap(focusLineInput: () => boolean) {
  return keymap.of([{ key: 'Mod-g', run: focusLineInput, preventDefault: true }, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...lintKeymap, ...foldKeymap]);
}
