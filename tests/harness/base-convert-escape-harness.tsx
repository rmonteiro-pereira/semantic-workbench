/** Renders the base conversion dialog with a save that answers only when the page says so, to check Escape during the save. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BaseConvertDialog } from '../../src/app/compile/ConvertDialog';
import type { BaseConvertClient } from '../../src/app/compile/use-convert';
import type { ProjectInfo } from '../../src/app/projects/api';

/** The 0.2 text the page receives before this script runs. */
const { source } = (window as unknown as { sources: { source: string } }).sources;
const target = { path: 'billing.mapping.yaml', source, hash: 'a'.repeat(64) };
const project = { slug: 'billing', name: 'Billing', files: [] } as unknown as ProjectInfo;

let finishSave: () => void = () => {};
const client: BaseConvertClient = {
  convertBase: () =>
    new Promise(resolve => {
      finishSave = () => resolve({ path: target.path, version: 'b'.repeat(64), converted: 'c'.repeat(64) });
    }),
  file: async () => target,
};
Object.assign(window, { finishSave: () => finishSave() });

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
      {open && <BaseConvertDialog project={project} target={target} gitState="clean" unsaved={false} onClose={close} onConverted={() => {}} client={client} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
