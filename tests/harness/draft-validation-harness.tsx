/** Renders workspace validation of one open file whose text later starts to declare the Ossie 0.3 draft. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Doc } from '../../src/app/projects/api';
import { useValidation } from '../../src/app/workspace/hooks/useValidation';

/** The texts the page receives before this script runs: a 0.2 model and the same model as a 0.3 draft. */
const { before, after } = (window as unknown as { sources: { before: string; after: string } }).sources;
const doc = { id: 'demo/model.semantic.yaml', project: 'demo', path: 'model.semantic.yaml', filename: 'model.semantic.yaml', source: before, hash: 'h' } as unknown as Doc;

function App() {
  const [source, setSource] = useState(before);
  const { validation } = useValidation({ current: doc, source, tab: 'graph' });

  function declareDraft() {
    setSource(after);
  }

  return (
    <>
      <button onClick={declareDraft}>Declare the draft</button>
      <output aria-label="Codes">{validation.issues.map(issue => issue.code).join(' ') || 'none'}</output>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
