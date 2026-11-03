/** Displays read-only source comparisons for changes, file history and stale saves. */
import React, { useEffect, useRef } from 'react';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { languageFor, syntaxFor, highlighting } from '../editor/languages';
import './scm.css';
// Existing files keep both versions; a new file can show just its additions, still using
// CodeMirror's diff decorations. Read-only; used by Source Control, file history and stale saves.
/** Displays a read-only, syntax-highlighted comparison of two file versions. */
export function DiffView({
  before,
  after,
  filename,
  beforeLabel,
  afterLabel,
  label,
  newFile = false,
}: {
  before: string;
  after: string;
  filename: string;
  beforeLabel: string;
  afterLabel: string;
  label: string;
  newFile?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const additionsOnly = newFile && before === '';
  useEffect(() => {
    const syntax = syntaxFor(filename, after || before);
    const side = (doc: string, version: string) => ({
      doc,
      extensions: [
        lineNumbers(),
        highlighting,
        languageFor(syntax),
        EditorView.lineWrapping,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({ 'aria-label': version }),
      ],
    });
    if (additionsOnly) {
      const state = side(after, afterLabel);
      const view = new EditorView({
        ...state,
        extensions: [...state.extensions, unifiedMergeView({ original: before, highlightChanges: true, gutter: true, mergeControls: false })],
        parent: host.current!,
      });
      return () => view.destroy();
    }
    const view = new MergeView({
      a: side(before, beforeLabel),
      b: side(after, afterLabel),
      parent: host.current!,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 8 },
    });
    return () => view.destroy();
  }, [before, after, filename, beforeLabel, afterLabel, additionsOnly]);
  return (
    <figure className={`diff-view${additionsOnly ? ' diff-additions-only' : ''}`} role="group" aria-label={label}>
      <div className="diff-labels">
        {!additionsOnly && <span>{beforeLabel}</span>}
        <span>{additionsOnly ? `${afterLabel} · New file` : afterLabel}</span>
      </div>
      <div ref={host} className="diff-host" />
      {before === after && <p className="diff-same">The two versions are identical.</p>}
    </figure>
  );
}
