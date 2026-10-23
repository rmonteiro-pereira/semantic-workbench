/** The optional "Folder in repository" field of the Clone and Remote dialogs. */
import { useState } from 'react';
import { checkRepositoryFolder } from './repository-folder';

type FieldProps = {
  value: string;
  problem: string;
  onChange: (value: string) => void;
  hint: string;
  disabled?: boolean;
};

/** Keeps the typed folder, its normalised form and the reason it is refused, if it is. */
export function useFolderInput(initial = '') {
  const [text, setText] = useState(initial);
  const checked = checkRepositoryFolder(text);
  return {
    text,
    setText,
    folder: checked.ok ? checked.folder : '',
    problem: checked.ok ? '' : checked.message,
  };
}

/** A text field with its hint and, when the folder is not acceptable, the reason beneath it. */
export function FolderField({ value, problem, onChange, hint, disabled }: FieldProps) {
  return (
    <label>
      <span>Folder in repository (optional)</span>
      <input
        aria-label="Folder in repository"
        aria-invalid={problem ? true : undefined}
        disabled={disabled}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="semantic/ubl"
      />
      <span className="folder-hint">{problem || hint}</span>
    </label>
  );
}
