/** The "View options" button of a graph toolbar and the dialog that holds its rarely used controls. */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal } from 'lucide-react';
import { Modal } from '../projects/Modal';

// Graph toolbars keep the few controls a person reaches for every minute (centre or search, fit,
// zoom, full pierce). Everything else lives here, so the toolbar stays on one row and the canvas
// keeps its height.
/** Opens a dialog with the graph's secondary controls, grouped by what they do. */
export function GraphOptions({
  title = 'View options',
  intro,
  children,
}: {
  title?: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const doneButton = (
    <button className="primary" onClick={close}>
      Done
    </button>
  );
  // The dialog renders outside the toolbar so the toolbar's compact control styles do not apply.
  return (
    <>
      <button onClick={() => setOpen(true)} title={title} className="graph-options-button">
        <SlidersHorizontal size={14} />
        <span className="tool-label">{title}…</span>
      </button>
      {open &&
        createPortal(
          <Modal title={title} size="small" onCancel={close} footer={doneButton}>
            {intro && <p>{intro}</p>}
            <div className="graph-options">{children}</div>
          </Modal>,
          document.body,
        )}
    </>
  );
}

/** One titled group of options inside the View options dialog. */
export function OptionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="option-group" aria-label={title}>
      <h3>{title}</h3>
      <div className="option-group-body">{children}</div>
    </section>
  );
}
