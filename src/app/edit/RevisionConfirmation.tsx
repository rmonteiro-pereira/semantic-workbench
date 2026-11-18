/** Asks the author before a document moves to the Tessera revision that an added property needs, because older workbenches stop reading it. */
import React, { useState } from 'react';
import { Modal } from '../projects/Modal';
import { ADDITIONS_REVISION, revisionNeed, withRevision } from '../../shared/tessera/revision-edit';
import { TesseraNames } from '../../shared/tessera/format';
import type { Doc } from '../projects/api';

/** The words of the confirmation for the two ways a document can need a revision. */
export function revisionQuestion(source: string): { title: string; body: string; confirm: string } | null {
  const need = revisionNeed(source);
  const name = `${TesseraNames.product} ${ADDITIONS_REVISION}`;
  if (need === 'mark')
    return {
      title: `Mark this file as ${name}?`,
      body: `The attribute order, agent context and governance are ${TesseraNames.product} additions. The file has to say so with a ${TesseraNames.markerKey} line at its top. Standard Ossie tools do not read that line, and the compiler removes it when it makes standard output.`,
      confirm: `Mark as ${name}`,
    };
  if (need === 'raise')
    return {
      title: `Move this file to ${name}?`,
      body: `This property needs revision ${ADDITIONS_REVISION}. Workbenches that only know revision 1 cannot open the file afterwards. Your other content stays as it is.`,
      confirm: `Move to ${name}`,
    };
  return null;
}

type Question = NonNullable<ReturnType<typeof revisionQuestion>>;

/** The confirmation dialog. Cancel leaves the file as it is. */
export function RevisionDialog({ question, busy, onCancel, onConfirm }: { question: Question; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal
      title={question.title}
      onCancel={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving…' : question.confirm}
          </button>
        </>
      }
    >
      <p>{question.body}</p>
    </Modal>
  );
}

type Pending = { question: Question; run: (source: (text: string) => string) => Promise<void> };

/**
 * Runs a change at once when the document is current enough. Otherwise it shows the confirmation and runs the change with the revision raised in the same save, or not at all when the author declines.
 * The change receives a function that raises the revision of the text it plans to write.
 */
export function useRevisionGate(doc: Doc) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const raise = (text: string) => withRevision(text, doc.filename);

  async function gate(run: (finish: (text: string) => string) => Promise<void>) {
    const question = revisionQuestion(doc.source);
    if (!question) return run(text => text);
    setPending({ question, run });
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run(raise);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const dialog = pending && <RevisionDialog question={pending.question} busy={busy} onCancel={() => setPending(null)} onConfirm={confirm} />;
  return { gate, dialog };
}
