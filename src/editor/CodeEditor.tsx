import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Annotation, Compartment, EditorSelection, EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  highlightSpecialChars,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { linter, lintGutter, lintKeymap, forceLinting } from '@codemirror/lint';
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { ListOrdered, Search } from 'lucide-react';
import type { Issue } from '../diagnostics';
import { changesToPatches, applyPatches, lineStarts, normalize, dominantLineBreak } from './patch';
import { languageFor, syntaxFor, highlighting } from './languages';
import { toDiagnostics, validateInWorker } from './lint';
import './editor.css';
// Source editor (FR-042–FR-047): CodeMirror 6 with syntax colors per serialization, findings drawn
// inline while typing (validated in a worker after a 300 ms pause), line numbers, search, Go to
// line, undo/redo and keyboard operation. `value` holds the file's exact bytes; every edit is mapped
// to a patch on those bytes (src/editor/patch.ts), so untouched line endings, tabs and the trailing
// newline never change.
export type CodeEditorHandle = {
  focus: () => void;
  goToLine: (line: number, column?: number) => void;
  locate: (issue: Issue) => void;
};
// `validate` replaces the whole-file check, for an editor that shows one item of a larger file.
type Props = {
  value: string;
  filename: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  onIssues?: (issues: Issue[], text: string) => void;
  validate?: (text: string) => Promise<Issue[]>;
};
const external = Annotation.define<boolean>();
// Shown when a file is loaded; new line breaks take the file's main style, so the label stays true.
const lineEndingLabel = (text: string) => {
  const crlf = /\r\n/.test(text),
    lf = /(^|[^\r])\n/.test(text),
    cr = /\r(?!\n)/.test(text),
    kind =
      [crlf, lf, cr].filter(Boolean).length > 1
        ? 'Mixed line endings'
        : crlf
          ? 'CRLF'
          : cr
            ? 'CR'
            : 'LF';
  return kind === 'Mixed line endings'
    ? `${kind} · new lines ${({ '\r\n': 'CRLF', '\n': 'LF', '\r': 'CR' } as const)[dominantLineBreak(text)]}`
    : kind;
};
export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  { value, filename, onChange, ariaLabel, disabled = false, className = '', onIssues, validate },
  ref,
) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    lineInput = useRef<HTMLInputElement>(null);
  const bytes = useRef(value),
    hasCR = useRef(value.includes('\r'));
  const [eol, setEol] = useState(() => lineEndingLabel(value));
  const props = useRef({ onChange, onIssues, filename, validate });
  props.current = { onChange, onIssues, filename, validate };
  const language = useRef(new Compartment()),
    editable = useRef(new Compartment());
  const [documentLevel, setDocumentLevel] = useState<Issue[]>([]),
    [cursor, setCursor] = useState({ line: 1, column: 1 }),
    [checking, setChecking] = useState(false);
  const head = value.slice(0, 400),
    syntax = useMemo(() => syntaxFor(filename, head), [filename, head]);
  useEffect(() => {
    const lint = linter(
      async v => {
        setChecking(true);
        const text = v.state.doc.toString(),
          issues = await (props.current.validate
            ? props.current.validate(text)
            : validateInWorker(text, props.current.filename));
        setChecking(false);
        if (v.state.doc.toString() !== text) return [];
        const { diagnostics, documentLevel } = toDiagnostics(issues, v.state.doc);
        setDocumentLevel(documentLevel);
        props.current.onIssues?.(issues, text);
        return diagnostics;
      },
      { delay: 300 },
    );
    const state = EditorState.create({
      doc: value,
      extensions: [
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
        language.current.of(languageFor(syntax)),
        editable.current.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]),
        lint,
        // Ctrl+G opens Go to line (as in VS Code) instead of search's find-next.
        keymap.of([
          {
            key: 'Mod-g',
            run: () => {
              lineInput.current?.focus();
              lineInput.current?.select();
              return true;
            },
            preventDefault: true,
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...lintKeymap,
          ...foldKeymap,
        ]),
        EditorView.contentAttributes.of({
          'aria-label': ariaLabel,
          'aria-multiline': 'true',
          spellcheck: 'false',
          autocorrect: 'off',
          autocapitalize: 'off',
        }),
        EditorView.updateListener.of(update => {
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head,
              line = update.state.doc.lineAt(head);
            setCursor({ line: line.number, column: head - line.from + 1 });
          }
          if (!update.docChanged || update.transactions.some(tr => tr.annotation(external))) return;
          // Map this edit onto the file's bytes, transaction by transaction.
          // A file without \r is the editor text itself: no offset mapping needed (fast path for large files).
          let text = bytes.current;
          for (const tr of update.transactions)
            if (tr.docChanged) {
              if (!hasCR.current) {
                const parts: string[] = [];
                let at = 0;
                tr.changes.iterChanges((fromA, toA, _b, _c, inserted) => {
                  parts.push(text.slice(at, fromA), inserted.toString());
                  at = toA;
                });
                parts.push(text.slice(at));
                text = parts.join('');
              } else
                text = applyPatches(
                  text,
                  changesToPatches(text, tr.startState.doc, tr.changes, lineStarts(text)),
                );
            }
          bytes.current = text;
          props.current.onChange(text);
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    // Browser checks read and set the file text through the content element, as a user agent would see it.
    Object.defineProperty(v.contentDOM, 'workbenchEditor', {
      value: { view: v, value: () => bytes.current },
    });
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);
  // External value (another file opened, a form edit, a reload): replace the editor text.
  useEffect(() => {
    const v = view.current;
    if (!v || value === bytes.current) return;
    bytes.current = value;
    hasCR.current = value.includes('\r');
    setEol(lineEndingLabel(value));
    const next = normalize(value),
      current = v.state.doc.toString();
    if (next !== current) {
      let a = 0;
      while (a < next.length && a < current.length && next[a] === current[a]) a++;
      let b = 0;
      while (
        b < next.length - a &&
        b < current.length - a &&
        next[next.length - 1 - b] === current[current.length - 1 - b]
      )
        b++;
      v.dispatch({
        changes: { from: a, to: current.length - b, insert: next.slice(a, next.length - b) },
        annotations: external.of(true),
      });
    }
    forceLinting(v);
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(languageFor(syntax)) });
  }, [syntax]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
    });
  }, [disabled]);
  const goToLine = (line: number, column = 1) => {
    const v = view.current;
    if (!v) return;
    const l = v.state.doc.line(Math.max(1, Math.min(v.state.doc.lines, line))),
      pos = Math.min(l.to, l.from + Math.max(0, column - 1));
    v.dispatch({
      selection: EditorSelection.range(l.to > pos ? l.to : pos, pos),
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    v.focus();
  };
  useImperativeHandle(
    ref,
    () => ({
      focus: () => view.current?.focus(),
      goToLine,
      locate: issue => {
        if (issue.line) goToLine(issue.line, issue.column);
      },
    }),
    [],
  );
  return (
    <div className={`code-editor ${className}`}>
      <div className="code-editor-bar">
        <span className="code-editor-syntax" title="Detected serialization">
          {syntax}
        </span>
        <span
          className="code-editor-eol"
          title="Line endings are kept as they are in the file; new lines use the file's main style"
        >
          {eol}
        </span>
        <span className="code-editor-position" aria-live="off">
          Ln {cursor.line}, Col {cursor.column}
        </span>
        {checking && (
          <span className="code-editor-checking" role="status">
            Checking…
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            const v = view.current;
            if (v) {
              openSearchPanel(v);
            }
          }}
          title="Find and replace (Ctrl+F)"
        >
          <Search size={13} />
          Find
        </button>
        <form
          className="code-editor-goto"
          onSubmit={e => {
            e.preventDefault();
            const n = Number(lineInput.current?.value);
            if (n > 0) {
              goToLine(n);
              if (lineInput.current) lineInput.current.value = '';
            }
          }}
        >
          <label title="Go to line (Ctrl+G)">
            <ListOrdered size={13} />
            <input
              ref={lineInput}
              type="number"
              min={1}
              inputMode="numeric"
              aria-label="Go to line"
              placeholder="Line"
            />
          </label>
        </form>
      </div>
      {documentLevel.length > 0 && (
        <ul className="code-editor-document-findings" aria-label="Document-level findings">
          {documentLevel.map((i, n) => (
            <li key={n} className={i.severity}>
              <strong>{i.severity === 'error' ? 'Error' : 'Warning'}</strong> {i.message}
            </li>
          ))}
        </ul>
      )}
      <div className="code-editor-host" ref={host} />
    </div>
  );
});
