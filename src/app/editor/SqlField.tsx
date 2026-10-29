/** Provides a SQL form input with nonblocking lint warnings; non-SQL dialects stay plain text. */
import React, { useEffect, useRef, useState } from 'react';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { linter, lintKeymap, forceLinting } from '@codemirror/lint';
import { StandardSQL } from '@codemirror/lang-sql';
import { highlighting } from './languages';
import { toDiagnostics, lintSqlInWorker } from './lint';
import { grammarOf } from '../../shared/sql/regions';
import type { Issue } from '../../shared/validation/diagnostics';
import './editor.css';
// Findings appear as warnings and never block saving. Non-SQL dialects such as DAX and MDX are
// left unchecked.
const fromProps = Annotation.define<boolean>();
type Props = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  labelledBy?: string;
  id?: string;
  dialect?: string | null;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  onFindings?: (issues: Issue[]) => void;
};
/** Edits a SQL expression with nonblocking syntax warnings. */
/** The "Line 3, column 5: " lead-in of a finding, as precise as its position allows. */
function locationPrefix(finding: Issue): string {
  if (finding.line && finding.line > 1) {
    return `Line ${finding.line}, column ${finding.column}: `;
  }
  if (finding.column) return `Column ${finding.column}: `;
  return '';
}

export function SqlField({ value, onChange, ariaLabel, labelledBy, id, dialect = null, rows = 2, placeholder, disabled = false, onFindings }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const props = useRef({ onChange, dialect, onFindings });
  props.current = { onChange, dialect, onFindings };
  const language = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const [findings, setFindings] = useState<Issue[]>([]);
  const sql = grammarOf(dialect) !== null;
  useEffect(() => {
    const lint = linter(
      async lintView => {
        const text = lintView.state.doc.toString();
        const issues = await lintSqlInWorker(text, props.current.dialect ?? null);
        if (lintView.state.doc.toString() !== text) return [];
        setFindings(issues);
        props.current.onFindings?.(issues);
        return toDiagnostics(issues, lintView.state.doc).diagnostics;
      },
      { delay: 250 },
    );
    const editorView = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          highlighting,
          language.current.of(sql ? StandardSQL : []),
          lint,
          EditorView.lineWrapping,
          editable.current.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]),
          placeholder ? placeholderExt(placeholder) : [],
          keymap.of([...defaultKeymap, ...historyKeymap, ...lintKeymap]),
          EditorView.contentAttributes.of({
            ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
            ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
            ...(id ? { id } : {}),
            'aria-multiline': 'true',
            role: 'textbox',
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
          }),
          EditorView.theme({ '.cm-content': { minHeight: `${rows * 1.5}em` } }),
          EditorView.updateListener.of(u => {
            if (u.docChanged && !u.transactions.some(t => t.annotation(fromProps))) props.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editorView;
    return () => {
      editorView.destroy();
      view.current = null;
    };
  }, []);
  // A value set from outside (prefill, reset) replaces the text.
  useEffect(() => {
    const currentView = view.current;
    if (!currentView) return;
    const current = currentView.state.doc.toString();
    if (current !== value) {
      currentView.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: fromProps.of(true),
      });
      forceLinting(currentView);
    }
  }, [value]);
  useEffect(() => {
    const currentView = view.current;
    if (!currentView) return;
    currentView.dispatch({ effects: language.current.reconfigure(sql ? StandardSQL : []) });
    forceLinting(currentView);
  }, [sql, dialect]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]),
    });
  }, [disabled]);
  return (
    <div className={`sql-field${disabled ? ' disabled' : ''}`}>
      <div ref={host} className="sql-field-editor" />
      {!sql && dialect && <small className="sql-field-note">{dialect} is not SQL: shown as written, not checked.</small>}
      {findings.length > 0 && (
        <ul className="sql-field-findings" aria-label="SQL findings">
          {findings.map((finding, i) => (
            <li key={i}>
              {locationPrefix(finding)}
              {finding.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
