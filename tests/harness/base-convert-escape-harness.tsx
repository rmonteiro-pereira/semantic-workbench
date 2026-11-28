/**
 * Renders the base conversion's hook in the workbench dialog with a save that answers only when the
 * page says so, to check Escape during the save. The diff view is left out: the test bundler cannot
 * load CodeMirror's highlighting, and Escape does not depend on it.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cancelDuringConversion, useBaseConvert, type BaseConvertClient } from '../../src/app/compile/use-convert';
import { Modal } from '../../src/app/projects/Modal';

/** The 0.2 text the page receives before this script runs. */
const { source } = (window as unknown as { sources: { source: string } }).sources;
const target = { path: 'billing.mapping.yaml', source, hash: 'a'.repeat(64) };

let finishSave: () => void = () => {};
const client: BaseConvertClient = {
  convertBase: () =>
    new Promise(resolve => {
      finishSave = () => resolve({ path: target.path, version: 'b'.repeat(64), converted: 'c'.repeat(64) });
    }),
  file: async () => target,
};
Object.assign(window, { finishSave: () => finishSave() });

function ConversionDialog({ onClose }: { onClose: () => void }) {
  const control = useBaseConvert('billing', target, () => {}, client);
  return (
    <Modal
      title="Convert billing.mapping.yaml"
      onCancel={cancelDuringConversion(control.view, onClose)}
      footer={
        <button type="button" onClick={control.convert}>
          Convert
        </button>
      }
    >
      <output aria-label="Status">{control.view.status}</output>
    </Modal>
  );
}

function App() {
  const [open, setOpen] = useState(true);
  const [closed, setClosed] = useState(0);

  function close() {
    setClosed(count => count + 1);
    setOpen(false);
  }

  return (
    <>
      <output aria-label="Closed">{closed}</output>
      {open && <ConversionDialog onClose={close} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
