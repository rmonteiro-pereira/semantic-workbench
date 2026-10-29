/** Offers deletion undo until the server-provided deadline expires. */
import React, { useEffect, useState } from 'react';
import type { Deleted } from './api';

/** Offers undo while the server's deletion deadline remains valid. */
export function UndoToast({ deleted, onUndo, onExpire }: { deleted: Deleted; onUndo: () => void; onExpire: () => void }) {
  const left = () => Math.max(0, Math.ceil((Date.parse(deleted.undoUntil) - Date.now()) / 1000));
  const [seconds, setSeconds] = useState(left());
  useEffect(() => {
    const timer = setInterval(() => {
      const s = left();
      setSeconds(s);
      if (!s) onExpire();
    }, 250);
    return () => clearInterval(timer);
  }, [deleted]);
  return (
    <div role="status" className="undo-toast">
      <span>Deleted {deleted.label}. It is in the trash.</span>
      <button onClick={onUndo}>Undo</button>
      <small aria-hidden="true">{seconds}s</small>
    </div>
  );
}
