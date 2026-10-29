/** Owns the CodeMirror view and synchronizes it with React props. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { linter, forceLinting } from '@codemirror/lint';
import { baseEditorExtensions, editorKeymap } from './editorExtensions';
import type { Issue } from '../validation/diagnostics';
import { normalize } from './patch';
import {
  applyEditorTransactions,
  external,
  lineEndingLabel,
  replacementChange,
} from './editorText';
import { languageFor, syntaxFor } from './languages';
import { initialDocumentMode, resolveDocumentMode } from './documentMode';
import { summarizeDiagnostics, toDiagnostics, validateInWorker, type FindingSummary } from './lint';
import type { CodeEditorOptions } from './editorTypes';

/** Creates one editor view and keeps external values, syntax and editability in sync. */
export function useCodeMirror({
  value,
  filename,
  documentId,
  onChange,
  ariaLabel,
  disabled = false,
  onIssues,
  validate,
}: CodeEditorOptions) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lineInput = useRef<HTMLInputElement>(null);
  const bytes = useRef(value);
  const hasCarriageReturn = useRef(value.includes('\r'));
  const [lineEnding, setLineEnding] = useState(() => lineEndingLabel(value));
  const latestProps = useRef({ onChange, onIssues, filename, validate });
  latestProps.current = { onChange, onIssues, filename, validate };
  const language = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const [documentLevel, setDocumentLevel] = useState<Issue[]>([]);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [checking, setChecking] = useState(false);
  const [findingSummary, setFindingSummary] = useState<FindingSummary | null>(null);
  const head = value.slice(0, 400);
  const syntax = useMemo(() => syntaxFor(filename, head), [filename, head]);
  const largeDocument = useRef(initialDocumentMode(value.length));
  const [largeMode, setLargeMode] = useState(largeDocument.current);
  const [modeAvailable, setModeAvailable] = useState(largeDocument.current);
  const modeOverride = useRef<boolean | undefined>(undefined);
  const openedDocument = useRef(documentId ?? filename);

  function toggleParsingMode() {
    const nextMode = !largeDocument.current;
    modeOverride.current = nextMode;
    largeDocument.current = nextMode;
    setLargeMode(nextMode);
    view.current?.dispatch({
      effects: language.current.reconfigure(languageFor(syntax, nextMode)),
    });
  }
  async function validateDocument(editorView: EditorView) {
    setChecking(true);
    const text = editorView.state.doc.toString();
    const issues = await (latestProps.current.validate
      ? latestProps.current.validate(text)
      : validateInWorker(text, latestProps.current.filename));
    setChecking(false);
    if (editorView.state.doc.toString() !== text) return [];
    const { diagnostics, documentLevel } = toDiagnostics(issues, editorView.state.doc);
    setDocumentLevel(documentLevel);
    setFindingSummary(summarizeDiagnostics(diagnostics, editorView.state.doc));
    latestProps.current.onIssues?.(issues, text);
    return diagnostics;
  }

  function handleUpdate(update: ViewUpdate) {
    if (update.selectionSet || update.docChanged) {
      const cursorOffset = update.state.selection.main.head;
      const line = update.state.doc.lineAt(cursorOffset);
      setCursor({ line: line.number, column: cursorOffset - line.from + 1 });
    }
    const isExternal = update.transactions.some(transaction => transaction.annotation(external));
    if (!update.docChanged || isExternal) return;
    const text = applyEditorTransactions(
      bytes.current,
      update.transactions,
      hasCarriageReturn.current,
    );
    bytes.current = text;
    latestProps.current.onChange(text);
  }

  function focusLineInput() {
    lineInput.current?.focus();
    lineInput.current?.select();
    return true;
  }

  useEffect(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseEditorExtensions(),
        language.current.of(languageFor(syntax, largeDocument.current)),
        editable.current.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)]),
        linter(validateDocument, { delay: 300 }),
        editorKeymap(focusLineInput),
        EditorView.contentAttributes.of({
          'aria-label': ariaLabel,
          'aria-multiline': 'true',
          spellcheck: 'false',
          autocorrect: 'off',
          autocapitalize: 'off',
        }),
        EditorView.updateListener.of(handleUpdate),
      ],
    });
    const editorView = new EditorView({ state, parent: host.current! });
    view.current = editorView;
    // Browser checks need both the normalized view and the original file bytes.
    Object.defineProperty(editorView.contentDOM, 'workbenchEditor', {
      value: { view: editorView, value: () => bytes.current },
    });
    return () => {
      editorView.destroy();
      view.current = null;
    };
  }, []);
  // External replacements must not be reported back as user edits.
  useEffect(() => {
    const editorView = view.current;
    const identity = documentId ?? filename;
    const newDocument = identity !== openedDocument.current;
    if (!editorView || (value === bytes.current && !newDocument)) return;
    openedDocument.current = identity;
    if (newDocument) modeOverride.current = undefined;
    bytes.current = value;
    hasCarriageReturn.current = value.includes('\r');
    setLineEnding(lineEndingLabel(value));
    const nextMode = resolveDocumentMode({
      length: value.length,
      previous: largeDocument.current,
      override: modeOverride.current,
      newDocument,
    });
    setLargeMode(nextMode);
    setModeAvailable(nextMode || modeOverride.current !== undefined);
    const modeChanged = nextMode !== largeDocument.current;
    largeDocument.current = nextMode;
    const next = normalize(value);
    const current = editorView.state.doc.toString();
    if (next !== current || modeChanged) {
      editorView.dispatch({
        changes: replacementChange(current, next),
        annotations: external.of(true),
        effects: modeChanged ? language.current.reconfigure(languageFor(syntax, nextMode)) : [],
      });
    }
    forceLinting(editorView);
  }, [value, filename, documentId]);
  useEffect(() => {
    view.current?.dispatch({
      effects: language.current.reconfigure(languageFor(syntax, largeDocument.current)),
    });
  }, [syntax]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorView.editable.of(!disabled),
        EditorState.readOnly.of(disabled),
      ]),
    });
  }, [disabled]);
  return {
    host,
    view,
    lineInput,
    lineEnding,
    documentLevel,
    cursor,
    checking,
    findingSummary,
    syntax,
    largeMode,
    modeAvailable: syntax === 'YAML' && modeAvailable,
    toggleParsingMode,
  };
}
