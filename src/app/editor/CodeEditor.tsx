/** Source editor with byte-preserving edits, inline validation and navigation controls. */
import { forwardRef, useImperativeHandle } from 'react';
import { openSearchPanel } from '@codemirror/search';
import type { Issue } from '../../shared/validation/diagnostics';
import { OSSIE_SCHEMA_VERSION, isNotValidated } from '../../shared/validation/validation';
import type { CodeEditorOptions } from './editorTypes';
import { EditorStatusBar } from './EditorStatusBar';
import { goToEditorLine } from './editorNavigation';
import { useCodeMirror } from './useCodeMirror';
import './editor.css';

/** Provides focus and location navigation for the source editor. */
export type CodeEditorHandle = {
  focus: () => void;
  goToLine: (line: number, column?: number) => void;
  locate: (issue: Issue) => void;
};

/** Edits a source file while preserving untouched original bytes. */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorOptions>(function CodeEditor({ className = '', ...options }, ref) {
  const { host, view, lineInput, lineEnding, documentLevel, cursor, checking, findingSummary, syntax, largeMode, modeAvailable, toggleParsingMode } = useCodeMirror(options);

  function goToLine(line: number, column = 1) {
    goToEditorLine(view.current, line, column);
  }

  function find() {
    if (view.current) openSearchPanel(view.current);
  }

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
      <EditorStatusBar
        syntax={syntax}
        largeMode={largeMode}
        modeAvailable={modeAvailable}
        onToggleParsing={toggleParsingMode}
        lineEnding={lineEnding}
        cursor={cursor}
        checking={checking}
        findingSummary={findingSummary}
        lineInput={lineInput}
        onFind={find}
        goToLine={goToLine}
      />
      {documentLevel.length > 0 && (
        <ul className={`code-editor-document-findings${documentLevel.every(issue => issue.severity === 'info') ? ' notice' : ''}`} aria-label="Document-level findings">
          {documentLevel.map((issue, index) => (
            <li key={index} className={issue.severity}>
              {isNotValidated(issue) ? (
                <>
                  {issue.message}
                  {options.onValidateAsShippedVersion && (
                    <button type="button" onClick={options.onValidateAsShippedVersion}>
                      Validate as Ossie {OSSIE_SCHEMA_VERSION}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <strong>{issue.severity === 'error' ? 'Error' : 'Warning'}</strong> {issue.message}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="code-editor-host" ref={host} />
    </div>
  );
});
