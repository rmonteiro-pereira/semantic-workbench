/** Shows a contract id on one line in a monospace chip, with a button that copies it. */
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

// How long the button says "Copied" before it goes back to "Copy".
const COPIED_MESSAGE_MS = 1500;

/** Renders the id so it never breaks in the middle, and lets a person copy it in one press. */
export function ContractId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard
      ?.writeText(id)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MESSAGE_MS);
      })
      .catch(() => {});
  }
  return (
    <span className="odcs-contract-id">
      <code>{id}</code>
      <button type="button" aria-label="Copy contract id" onClick={copy}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}
