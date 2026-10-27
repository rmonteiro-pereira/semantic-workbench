// Renders the shared dialog in Chromium for focus, dismissal and layout tests.
// Browser harness for tests/modal.test.tsx (bundled with Bun.build, run in Chromium).
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '../../src/app/projects/Modal';
function App() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <output aria-label="Log">{log.join(',')}</output>
      {open && (
        <Modal
          title="Example"
          size="wide"
          onCancel={() => {
            setLog(l => [...l, 'cancel']);
            setOpen(false);
          }}
          footer={<button onClick={() => setOpen(false)}>Done</button>}
        >
          <label>
            Name
            <input aria-label="Name" />
          </label>
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
