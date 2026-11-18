/** The status of an item as a word and a shape, so the meaning never depends on colour. */
import React from 'react';
import { statusLabel } from '../../shared/governance/item-governance';
import './governance.css';

type Shape = 'filled' | 'outlined' | 'struck' | 'dashed';

function shapeOf(status: string | undefined): Shape {
  if (status === 'approved') return 'filled';
  if (status === 'proposed') return 'outlined';
  if (status === 'deprecated') return 'struck';
  return 'dashed';
}

/** Draws the shape: a filled circle, an outlined circle, a circle with a line through it, or a dashed circle. */
function ShapeIcon({ shape }: { shape: Shape }) {
  return (
    <svg className={`status-shape status-shape-${shape}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="4.5" strokeDasharray={shape === 'dashed' ? '2 2' : undefined} fill={shape === 'filled' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
      {shape === 'struck' && <line x1="2" y1="10" x2="10" y2="2" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}

/** Renders the status word with its shape. */
export function StatusMark({ status }: { status: string | undefined }) {
  return (
    <span className={`status-mark status-${shapeOf(status)}`}>
      <ShapeIcon shape={shapeOf(status)} />
      <span className="status-word">{statusLabel(status)}</span>
    </span>
  );
}
