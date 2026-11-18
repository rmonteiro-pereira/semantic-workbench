/** Displays the declared files of a visible ontology unit. */
import React from 'react';
import './mesh.css';

/** Identifies the root and parts available for one selected file. */
export type PartSelection = { active: string; files: readonly string[]; part: boolean };

/** Shows the selected file's role and offers navigation to the other declared files. */
export function PartPicker({ selection, open }: { selection: PartSelection; open?: (file: string) => void }) {
  const [root, ...parts] = selection.files;
  if (!root) {
    if (!selection.part) return null;
    return <p className="mesh-unit-note">No readable root lists this part.</p>;
  }
  return (
    <section className="mesh-unit-files" aria-label="Ontology unit">
      <p className="mesh-unit-note">
        {selection.part ? (
          <>
            Part of <strong>{root}</strong>
          </>
        ) : (
          <>
            Root with {parts.length} {parts.length === 1 ? 'part' : 'parts'}
          </>
        )}
      </p>
      {open && parts.length > 0 && (
        <ul className="mesh-unit-picker" aria-label="Unit files">
          {selection.files.map(path => (
            <li key={path}>
              <button type="button" aria-current={path === selection.active ? 'true' : undefined} onClick={() => open(path)}>
                {path}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
