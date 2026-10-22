/** Renders stable handlers through React's commit lifecycle without a server. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStableHandler } from '../../src/app/useStableHandler';

function App() {
  const [version, setVersion] = useState(1);
  const [result, setResult] = useState('');
  const callback = useStableHandler((name: string, count: number) => {
    const value = `${name}: ${count * version}`;
    setResult(value);
    return value;
  });
  const [originalCallback] = useState(() => callback);

  function replaceHandler() {
    setVersion(current => current + 1);
  }

  function callOriginalHandler() {
    originalCallback('Orders', 2);
  }

  return (
    <>
      <button onClick={replaceHandler}>Replace handler</button>
      <button onClick={callOriginalHandler}>Call original handler</button>
      <output aria-label="Handler version">{version}</output>
      <output aria-label="Stable identity">{String(originalCallback === callback)}</output>
      <output aria-label="Result">{result}</output>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
