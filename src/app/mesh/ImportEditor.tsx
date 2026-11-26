/** Lets an author choose a published provider and the exact concepts its alias exposes. */
import { DisclosureNotice } from './DisclosureNotice';
import React, { useState } from 'react';
import type { UnitImport } from '../../shared/tessera/imports';
import type { ProviderChoice } from './api';

type Props = { providers: readonly ProviderChoice[]; existing?: UnitImport; aliases: ReadonlySet<string>; onAdd: (entry: UnitImport) => Promise<void>; onCancel: () => void };

/** Renders the import form and sends a complete declaration when the author saves. */
export function ImportEditor({ providers, existing, aliases, onAdd, onCancel }: Props) {
  const [selected, setSelected] = useState<ProviderChoice | undefined>(() => providers.find(provider => provider.project === existing?.project && provider.ontology === existing?.ontology));
  const [alias, setAlias] = useState(existing?.alias ?? '');
  const [concepts, setConcepts] = useState<string[]>(() => existing?.concepts.filter(concept => selected?.concepts.includes(concept)) ?? []);
  const existingPin = typeof existing?.version === 'object' ? existing.version.pin : '';
  const [pin, setPin] = useState(!!existingPin);
  const [version, setVersion] = useState(existingPin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canSave = selected && /^[A-Za-z0-9_]+$/.test(alias) && !aliases.has(alias) && concepts.length > 0 && (!pin || !!version.trim()) && !saving;

  function selectProvider(provider: ProviderChoice) {
    setSelected(provider);
    if (!existing) setAlias(provider.project.replaceAll('-', '_'));
    setConcepts(existing?.concepts.filter(concept => provider.concepts.includes(concept)) ?? []);
    setVersion('');
  }

  function toggleConcept(concept: string) {
    setConcepts(previous => (previous.includes(concept) ? previous.filter(item => item !== concept) : [...previous, concept]));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !canSave) return;
    setSaving(true);
    setError('');
    try {
      await onAdd({ project: selected.project, ontology: selected.ontology, alias, concepts, version: pin ? { pin: version.trim() } : 'latest' });
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }

  return (
    <form className="mesh-import-editor" onSubmit={submit}>
      <fieldset disabled={saving}>
        <legend>Provider ontology</legend>
        {!providers.length && <p>No readable project has a published interface.</p>}
        {providers.map(provider => (
          <label className="mesh-option" key={JSON.stringify([provider.project, provider.ontology])}>
            <input type="radio" name="mesh-provider" checked={provider === selected} onChange={() => selectProvider(provider)} />
            <span>
              {provider.name} / {provider.ontology}
            </span>
          </label>
        ))}
      </fieldset>
      {selected && (
        <>
          <label>
            Alias <input value={alias} onChange={event => setAlias(event.target.value)} required />
          </label>
          {aliases.has(alias) && <p>That alias is already in use.</p>}
          <fieldset disabled={saving}>
            <legend>Concepts to import</legend>
            {selected.concepts.map(concept => (
              <label className="mesh-option" key={concept}>
                <input type="checkbox" checked={concepts.includes(concept)} onChange={() => toggleConcept(concept)} />
                <span>{concept}</span>
              </label>
            ))}
          </fieldset>
          <label className="mesh-option">
            <input type="checkbox" checked={pin} onChange={event => setPin(event.target.checked)} />
            <span>Pin a published commit or release tag</span>
          </label>
          {pin && (
            <label>
              Commit or tag <input value={version} onChange={event => setVersion(event.target.value)} required />
            </label>
          )}
        </>
      )}
      <DisclosureNotice />
      {error && <p role="alert">{error}</p>}
      <div className="mesh-actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!canSave}>
          {saving ? 'Saving' : 'Save import'}
        </button>
      </div>
    </form>
  );
}
