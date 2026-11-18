// Loaded only from the person menu; the canvas owns the sheet's place without changing closed screens.
import { createRoot } from 'react-dom/client';
import { BrandProvider } from '../brand/BrandContext';
import { AgentPanel } from './AgentPanel';

let closeCurrent: (() => void) | undefined;

/** Opens one sheet beside the canvas, restoring the person-menu focus when it closes. */
export function openAgentPanel(): void {
  if (closeCurrent) {
    document.querySelector<HTMLElement>('.agent-panel button')?.focus();
    return;
  }
  const canvas = document.querySelector('.canvas-row');
  if (!canvas) return;
  const container = document.createElement('div');
  container.className = 'agent-panel-host';
  canvas.append(container);
  const root = createRoot(container);
  const close = () => {
    root.unmount();
    container.remove();
    closeCurrent = undefined;
    document.querySelector<HTMLElement>('[aria-label="Person menu"]')?.focus();
  };
  closeCurrent = close;
  root.render(
    <BrandProvider>
      <AgentPanel onClose={close} />
    </BrandProvider>,
  );
}
