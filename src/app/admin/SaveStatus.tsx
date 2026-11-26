import { useState } from 'react';

/** The time of day a change was saved, in the reader's locale. */
function savedTime(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Remembers when an Admin area last saved. The editor that saved is replaced by a fresh one
 * holding the new version, so the area that owns it keeps the note instead.
 */
export function useSavedAt() {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  return { savedAt, markSaved: () => setSavedAt(new Date()) };
}

/** Says that the area's last change was saved, and when. */
export function SavedNote({ at }: { at: Date | null }) {
  if (!at) return null;
  return (
    <p className="admin-saved" role="status">
      {`Saved at ${savedTime(at)}`}
    </p>
  );
}

/** Says that the draft holds changes that are not saved yet, and how to save them. */
export function UnsavedChangesNote({ action }: { action: string }) {
  return <p className="admin-unsaved">{`Unsaved changes. Use ${action} to save them.`}</p>;
}
