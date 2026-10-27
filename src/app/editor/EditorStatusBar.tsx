/** Status and navigation controls for the source editor. */
import type { FormEvent, RefObject } from 'react';
import { AlertTriangle, ListOrdered, Search, XCircle } from 'lucide-react';
import type { FindingSummary } from './lint';
import { largeDocumentThreshold } from './documentMode';

const largeModeDescription =
  `This file opened with over ${largeDocumentThreshold.toLocaleString('en-US')} characters. ` +
  'Colouring and folding work on what is on screen so typing stays fast.';

type Props = {
  syntax: string;
  largeMode: boolean;
  modeAvailable: boolean;
  onToggleParsing: () => void;
  lineEnding: string;
  cursor: { line: number; column: number };
  checking: boolean;
  /** The finding drawn in the editor to name here, so the gutter triangle has a visible message. */
  findingSummary: FindingSummary | null;
  lineInput: RefObject<HTMLInputElement | null>;
  onFind: () => void;
  goToLine: (line: number) => void;
};

/** One line for the status bar: the message and its line, with a count when there are more. */
function describeFinding({ count, line, message }: FindingSummary) {
  const others = count > 1 ? ` (+${count - 1} more)` : '';
  return `Line ${line}: ${message}${others}`;
}

/** Displays file syntax, cursor position, validation status and navigation controls. */
export function EditorStatusBar({
  syntax,
  largeMode,
  modeAvailable,
  onToggleParsing,
  lineEnding,
  cursor,
  checking,
  findingSummary,
  lineInput,
  onFind,
  goToLine,
}: Props) {
  function submitLine(event: FormEvent) {
    event.preventDefault();
    const lineNumber = Number(lineInput.current?.value);
    if (lineNumber <= 0 || Number.isNaN(lineNumber)) return;
    goToLine(lineNumber);
    if (lineInput.current) lineInput.current.value = '';
  }

  return (
    <div className="code-editor-bar">
      <span className="code-editor-syntax" title="Detected serialization">
        {syntax}
      </span>
      <span
        className="code-editor-eol"
        title="Line endings are kept as they are in the file; new lines use the file's main style"
      >
        {lineEnding}
      </span>
      <span className="code-editor-position" aria-live="off">
        Ln {cursor.line}, Col {cursor.column}
      </span>
      {modeAvailable && (
        <span className="code-editor-mode">
          <span
            className={`code-editor-badge${largeMode ? ' large' : ''}`}
            title={largeMode ? largeModeDescription : undefined}
          >
            {largeMode ? 'Large file mode' : 'Full parsing'}
          </span>
          <button type="button" onClick={onToggleParsing}>
            {largeMode ? 'Full parsing' : 'Large file mode'}
          </button>
        </span>
      )}
      {checking && (
        <span className="code-editor-checking" role="status">
          Checking…
        </span>
      )}
      {findingSummary && (
        <button
          type="button"
          className={`code-editor-finding ${findingSummary.severity}`}
          title={findingSummary.message}
          onClick={() => goToLine(findingSummary.line)}
        >
          {findingSummary.severity === 'error' ? (
            <XCircle size={13} aria-hidden="true" />
          ) : (
            <AlertTriangle size={13} aria-hidden="true" />
          )}
          <span>{describeFinding(findingSummary)}</span>
        </button>
      )}
      <button type="button" onClick={onFind} title="Find and replace (Ctrl+F)">
        <Search size={13} />
        Find
      </button>
      <form className="code-editor-goto" onSubmit={submitLine}>
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
  );
}
