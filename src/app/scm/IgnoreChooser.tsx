import { useState } from 'react';
import { ignoreChoices } from '../../shared/scm/gitignore';

/** Offers the .gitignore patterns that would cover one changed file. */
export function IgnoreChooser({ path, onAdd, onCancel }: { path: string; onAdd: (pattern: string) => void; onCancel: () => void }) {
  const choices = ignoreChoices(path);
  const [pattern, setPattern] = useState(choices[0].pattern);
  return (
    <div className="scm-ignore" role="group" aria-label={`Add ${path} to .gitignore`}>
      {choices.map(choice => (
        <label key={choice.pattern}>
          <input type="radio" name={'ignore-' + path} checked={pattern === choice.pattern} onChange={() => setPattern(choice.pattern)} />
          <span>{choice.label}</span>
          <code>{choice.pattern}</code>
        </label>
      ))}
      <div>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onAdd(pattern)}>
          Add to .gitignore
        </button>
      </div>
    </div>
  );
}
