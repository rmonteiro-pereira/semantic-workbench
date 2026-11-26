import { changeDescription } from './change-review';
import { SectionStatus } from './SectionStatus';
import { useState } from 'react';
import type { Program } from '../../server/connections/programs';
import { adminApi } from './api';
import { useAdminData } from './useAdminData';
import { ReviewChange } from './ReviewChange';

const scopeNames = ['read', 'validate', 'edit', 'commit', 'remote', 'publish'] as const;

/** Registration fields edited in place before the shared dry-run and confirmation flow. */
export function ProgramFields({ program, onChange }: { program: Program; onChange: (program: Program) => void }) {
  function field(name: keyof Program, value: string) {
    onChange({ ...program, [name]: value });
  }
  function toggleScope(scope: Program['scopes'][number]) {
    const scopes = program.scopes.includes(scope) ? program.scopes.filter(value => value !== scope) : [...program.scopes, scope];
    onChange({ ...program, scopes });
  }
  return (
    <fieldset className="agent-program-fields">
      <legend>{program.name || 'New agent program'}</legend>
      <label>
        Client id
        <textarea rows={1} value={program.clientId} onChange={event => field('clientId', event.target.value)} />
      </label>
      <label>
        Name
        <textarea rows={1} value={program.name} onChange={event => field('name', event.target.value)} />
      </label>
      <label>
        Description
        <textarea value={program.description} onChange={event => field('description', event.target.value)} />
      </label>
      <label>
        Redirect addresses, one per line
        <textarea value={program.redirectUris.join('\n')} onChange={event => onChange({ ...program, redirectUris: event.target.value.split('\n') })} />
      </label>
      <p>Exact HTTPS addresses, or loopback HTTP with an explicit port. Custom schemes are refused.</p>
      <fieldset>
        <legend>Allowed scopes</legend>
        {scopeNames.map(scope => (
          <label key={scope}>
            <input type="checkbox" checked={program.scopes.includes(scope)} onChange={() => toggleScope(scope)} />
            {scope}
          </label>
        ))}
      </fieldset>
      <label>
        Setup note
        <textarea value={program.setupNote} onChange={event => field('setupNote', event.target.value)} />
      </label>
    </fieldset>
  );
}

/** Reviews registered agent programs and shows which connections removals will end. */
export function AgentProgramsSection() {
  const { data, error, reload } = useAdminData(adminApi.programs);
  const [draft, setDraft] = useState<Program[] | null>(null);
  const programs = draft ?? data?.programs ?? [];
  function addProgram() {
    setDraft([...programs, { clientId: '', name: '', description: '', redirectUris: [''], scopes: ['read', 'validate', 'edit', 'commit'], setupNote: '' }]);
  }
  function changeProgram(index: number, program: Program) {
    setDraft(programs.map((current, currentIndex) => (currentIndex === index ? program : current)));
  }
  function removeProgram(index: number) {
    setDraft(programs.filter((_, currentIndex) => currentIndex !== index));
  }
  function saved() {
    setDraft(null);
    reload();
  }
  const removed = data?.programs.filter(before => !programs.some(program => program.clientId === before.clientId)) ?? [];
  return (
    <div className="agent-programs">
      <SectionStatus subject="agent programs" loading={!data && !error} error={error} onRetry={reload} />
      {data && (
        <>
          {!programs.length && <p>No agent programs registered.</p>}
          {programs.map((program, index) => (
            <section key={index}>
              <ProgramFields program={program} onChange={value => changeProgram(index, value)} />
              <button className="admin-remove" onClick={() => removeProgram(index)}>
                Remove {program.name || 'agent program'}
              </button>
            </section>
          ))}
          <button onClick={addProgram}>Add agent program</button>
          {draft && (
            <>
              {removed.length > 0 && <p>Removing {removed.map(program => program.name).join(', ')} ends its active connections when confirmed.</p>}
              <p>Removing a redirect or scope also ends affected connections. Dry run shows the affected count before confirmation.</p>
              <ReviewChange
                area="programs"
                proposal={{ formatVersion: 1, programs }}
                baseVersion={data.version}
                onSaved={saved}
                description={changeDescription(
                  'Save agent programs',
                  removed.map(program => program.name),
                )}
                destructive={removed.length > 0}
              />
              <button onClick={() => setDraft(null)}>Discard changes</button>
            </>
          )}
        </>
      )}
      <button onClick={reload}>Reload agent programs</button>
    </div>
  );
}
