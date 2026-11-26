import { RecordList, type RecordColumn } from './RecordList';
import { WrappingField } from './WrappingField';
import { EmptyState } from '../projects/EmptyState';
import { SavedNote, useSavedAt } from './SaveStatus';
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
        Client ID
        <WrappingField value={program.clientId} onValueChange={value => field('clientId', value)} />
      </label>
      <label>
        Name
        <WrappingField value={program.name} onValueChange={value => field('name', value)} />
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
            {connectionScopeLabel(scope)}
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

/** A scope in the words the consent page uses for it, "Read" rather than "read". */
export function connectionScopeLabel(scope: string): string {
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

type IndexedProgram = { program: Program; index: number };

const programColumns: RecordColumn<IndexedProgram>[] = [
  { label: 'Name', value: ({ program }) => program.name || 'New agent program' },
  { label: 'Client ID', value: ({ program }) => program.clientId || 'Not set yet' },
  { label: 'Allowed scopes', value: ({ program }) => program.scopes.map(connectionScopeLabel).join(', ') || 'None' },
];

/** Lists registered agent programs first and edits one at a time, before the shared review. */
export function AgentProgramsSection() {
  const { data, error, reload } = useAdminData(adminApi.programs);
  const [draft, setDraft] = useState<Program[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const { savedAt, markSaved } = useSavedAt();
  const programs = draft ?? data?.programs ?? [];
  function addProgram() {
    setDraft([...programs, { clientId: '', name: '', description: '', redirectUris: [''], scopes: ['read', 'validate', 'edit', 'commit'], setupNote: '' }]);
    setEditing(programs.length);
  }
  function changeProgram(index: number, program: Program) {
    setDraft(programs.map((current, currentIndex) => (currentIndex === index ? program : current)));
  }
  function removeProgram(index: number) {
    setDraft(programs.filter((_, currentIndex) => currentIndex !== index));
    setEditing(null);
  }
  function discard() {
    setDraft(null);
    setEditing(null);
  }
  function saved() {
    discard();
    markSaved();
    reload();
  }
  const removed = data?.programs.filter(before => !programs.some(program => program.clientId === before.clientId)) ?? [];
  const chosen = editing === null ? undefined : programs[editing];
  return (
    <div className="agent-programs">
      <div className="admin-actions">
        <button onClick={addProgram} disabled={!data}>
          Add agent program
        </button>
        <button onClick={reload}>Reload agent programs</button>
      </div>
      <SectionStatus subject="agent programs" loading={!data && !error} error={error} onRetry={reload} />
      <SavedNote at={savedAt} />
      {data && (
        <>
          {!programs.length && (
            <EmptyState title={draft ? 'No agent programs left in this draft' : 'No agent programs registered'}>
              {draft ? 'The removal is not saved yet. Review the change below, or discard it.' : 'Use Add agent program to register one that people may connect.'}
            </EmptyState>
          )}
          {programs.length > 0 && (
            <RecordList
              label="Agent programs"
              records={programs.map((program, index) => ({ program, index }))}
              recordKey={({ index }) => String(index)}
              columns={programColumns}
              actions={({ program, index }) => (
                <>
                  <button aria-label={`Edit ${program.name || 'new agent program'}`} onClick={() => setEditing(index)}>
                    Edit
                  </button>
                  <button className="admin-remove" onClick={() => removeProgram(index)}>
                    Remove {program.name || 'agent program'}
                  </button>
                </>
              )}
            />
          )}
          {chosen && editing !== null && <ProgramFields program={chosen} onChange={value => changeProgram(editing, value)} />}
          {draft && <ProgramsReview removedNames={removed.map(program => program.name)} proposal={{ formatVersion: 1, programs }} baseVersion={data.version} onSaved={saved} onDiscard={discard} />}
        </>
      )}
    </div>
  );
}

/** What the draft will end, the shared review, and the way back out of the draft. */
function ProgramsReview({
  removedNames,
  proposal,
  baseVersion,
  onSaved,
  onDiscard,
}: {
  removedNames: string[];
  proposal: { formatVersion: 1; programs: Program[] };
  baseVersion: string;
  onSaved: () => void;
  onDiscard: () => void;
}) {
  return (
    <section className="agent-programs-review" aria-label="Changes to agent programs">
      {removedNames.length > 0 && <p>Removing {removedNames.join(', ')} ends its active connections once the change is saved.</p>}
      <p>Removing a redirect address or scope also ends the connections that use it. Review change shows how many before you confirm.</p>
      <ReviewChange
        area="programs"
        proposal={proposal}
        baseVersion={baseVersion}
        onSaved={onSaved}
        description={changeDescription('Save agent programs', removedNames)}
        destructive={removedNames.length > 0}
        dirty
      />
      <button onClick={onDiscard}>Discard changes</button>
    </section>
  );
}
