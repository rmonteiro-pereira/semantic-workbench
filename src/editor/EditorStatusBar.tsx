/** Status and navigation controls for the source editor. */
import type { FormEvent, RefObject } from 'react';
import { ListOrdered, Search } from 'lucide-react';
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
  lineInput: RefObject<HTMLInputElement | null>;
  onFind: () => void;
  goToLine: (line: number) => void;
};

/** Displays file syntax, cursor position, validation status and navigation controls. */
export function EditorStatusBar({
  syntax,
  largeMode,
  modeAvailable,
  onToggleParsing,
  lineEnding,
  cursor,
  checking,
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
        <>
          <span title={largeMode ? largeModeDescription : undefined}>
            {largeMode ? 'Large file mode' : 'Full parsing'}
          </span>
          <button type="button" onClick={onToggleParsing}>
            {largeMode ? 'Full parsing' : 'Large file mode'}
          </button>
        </>
      )}
      {checking && (
        <span className="code-editor-checking" role="status">
          Checking…
        </span>
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
