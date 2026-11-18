// Attached paths are links only; the browser never adds file contents to a prompt.
import { useState, type FormEvent } from 'react';

/** Composes a prompt with optional virtual paths and lets the person cancel a turn. */
export function PromptBox({ disabled, working, send, cancel }: { disabled: boolean; working: boolean; send(text: string, files: string[]): Promise<boolean>; cancel(): void }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      await send(
        text,
        files
          .split('\n')
          .map(path => path.trim())
          .filter(Boolean),
      )
    ) {
      setText('');
      setFiles('');
    }
  }
  return (
    <form className="agent-prompt" onSubmit={submit}>
      <label>
        Message to your agent
        <textarea value={text} onChange={event => setText(event.target.value)} disabled={disabled || working} />
      </label>
      <details>
        <summary>Attach file paths</summary>
        <label>
          One /workbench/project/path per line
          <textarea value={files} onChange={event => setFiles(event.target.value)} disabled={disabled || working} />
        </label>
      </details>
      {working ? (
        <button type="button" onClick={cancel} disabled={disabled}>
          Cancel turn
        </button>
      ) : (
        <button className="primary" type="submit" disabled={disabled || !text.trim()}>
          Send message
        </button>
      )}
    </form>
  );
}
