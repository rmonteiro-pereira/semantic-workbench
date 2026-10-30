import { useMe } from '../auth/useMe';
import { useEffect, useState } from 'react';
import { SelectField } from './SelectField';
import { AdminPane, type PaneProps } from './AdminPane';
import { newIdentifier } from './helpers';
import { adminApi, problemText } from './api';
import { commaList } from './change-review';
import { ReviewChange } from './ReviewChange';
import { useAdminData } from './useAdminData';
import type { Grant, Role, ProjectsConfig } from './types';

async function loadGrantForm() {
  const [roles, grants, projects] = await Promise.all([adminApi.roles(), adminApi.grants(), adminApi.projects()]);
  return {
    version: grants.version,
    roles: [...roles.document.builtIn, ...roles.document.custom],
    grants: grants.document.grants,
    projects: projects.document,
  };
}
/** Formats a grant scope without hiding which projects or domains it names. */
export function scopeLabel(scope: Grant['scope']): string {
  if (scope.kind === 'workspace') return 'Whole workspace';
  if (scope.kind === 'domains') return 'Domains: ' + scope.domains.join(', ');
  return 'Projects: ' + scope.projects.join(', ');
}
/** Displays a stored label or directory name without hiding the group's identifier. */
export function GroupName({ id, displayName, onResolved }: { id: string; displayName?: string | null; onResolved?: (group: Awaited<ReturnType<typeof adminApi.group>>) => void }) {
  const [name, setName] = useState('looking up name…');
  useEffect(() => {
    if (displayName !== undefined) return;
    let active = true;
    setName('looking up name…');
    void adminApi.group(id).then(
      group => {
        if (active) {
          onResolved?.(group);
          setName(group.displayName || 'name not resolved');
        }
      },
      problem => {
        if (active) setName(`name not resolved (${problemText(problem)})`);
      },
    );
    return () => {
      active = false;
    };
  }, [id, displayName, onResolved]);
  return <span>{displayName !== undefined ? displayName || 'name not resolved' : name}</span>;
}
/** Adds or changes a grant through the same form wherever members are managed. */
export function GrantForm({
  onBack,
  backLabel,
  onSaved,
  initial,
  email = '',
  roleId = 'viewer',
}: PaneProps & {
  backLabel: string;
  onSaved: () => void;
  initial?: Grant;
  email?: string;
  roleId?: string;
}) {
  const { data, error } = useAdminData(loadGrantForm);
  return (
    <AdminPane title={initial ? 'Change grant' : 'Add grant'} backLabel={backLabel} onBack={onBack} lastAdminNotice={Boolean(initial)}>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Loading grants…</p>}
      {data && <GrantFields {...data} initial={initial} email={email} roleId={roleId} onSaved={onSaved} />}
    </AdminPane>
  );
}

function GrantFields({
  version,
  roles,
  grants,
  projects,
  initial,
  email,
  roleId,
  onSaved,
}: {
  version: string;
  roles: Role[];
  grants: Grant[];
  projects: ProjectsConfig;
  initial?: Grant;
  email: string;
  roleId: string;
  onSaved: () => void;
}) {
  const { me } = useMe();
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof adminApi.group>> | null>(null);
  const [kind, setKind] = useState<'group' | 'email'>(initial?.member.kind ?? (email ? 'email' : 'group'));
  let initialMember = email;
  if (initial) {
    initialMember = initial.member.kind === 'email' ? initial.member.email : initial.member.groupId;
  }
  const [member, setMember] = useState(initialMember);
  const [displayName, setDisplayName] = useState(initial?.member.kind === 'group' ? (initial.member.displayName ?? '') : '');
  const [role, setRole] = useState(initial?.roleId ?? roleId);
  const [scope, setScope] = useState<Grant['scope']['kind']>(initial?.scope.kind ?? 'workspace');
  const [targets, setTargets] = useState(initial?.scope.kind === 'domains' ? initial.scope.domains.join(', ') : '');
  const [projectTargets, setProjectTargets] = useState(initial?.scope.kind === 'projects' ? initial.scope.projects.join(', ') : '');
  const [id] = useState(() => initial?.id ?? newIdentifier('g_'));
  const [addedAt] = useState(() => initial?.addedAt ?? new Date().toISOString());
  const selectedScope = grantScope(role, scope, targets, projectTargets);
  const groupLabel = displayName.trim();
  const proposed: Grant = {
    id,
    roleId: role,
    member:
      kind === 'email'
        ? { kind, email: member.trim().toLowerCase() }
        : {
            kind,
            groupId: member.trim(),
            ...(groupLabel ? { displayName: groupLabel } : {}),
          },
    scope: selectedScope,
    addedBy: initial?.addedBy ?? me?.id ?? me?.name ?? '',
    addedAt,
  };
  const changeLabel = `${initial ? 'Change' : 'Add'} ${role} grant for ${member}: ${scopeLabel(selectedScope)}`;
  const proposal = { grants: [...grants.filter(grant => grant.id !== initial?.id), proposed] };
  const emptyScope = selectedScope.kind !== 'workspace' && !commaList(scope === 'domains' ? targets : projectTargets).length;
  return (
    <>
      <SelectField label="Member kind" value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="group">Entra group</option>
        <option value="email">E-mail</option>
      </SelectField>
      <label>
        {kind === 'group' ? 'Group object ID' : 'E-mail address'}
        <input
          value={member}
          type={kind === 'email' ? 'email' : 'text'}
          onChange={event => {
            setMember(event.target.value);
            setDisplayName('');
            setLookup(null);
          }}
        />
      </label>
      {kind === 'group' && member.trim() && (
        <p>
          Group name:{' '}
          <GroupName id={member.trim()} displayName={initial?.member.kind === 'group' && initial.member.groupId === member.trim() ? displayName.trim() || null : undefined} onResolved={setLookup} />
        </p>
      )}
      {kind === 'group' && (
        <label>
          Group label (optional)
          <input value={displayName} placeholder={lookup?.id === member.trim() ? (lookup.displayName ?? '') : ''} onChange={event => setDisplayName(event.target.value)} />
          <small>Display only. Access is matched by group object ID, not this label.</small>
        </label>
      )}
      <SelectField label="Role" value={role} onChange={event => setRole(event.target.value)}>
        {roles.map(item => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Applies to" value={role === 'admin' ? 'workspace' : scope} disabled={role === 'admin'} onChange={event => setScope(event.target.value as typeof scope)}>
        <option value="workspace">Whole workspace</option>
        <option value="domains">Domains</option>
        <option value="projects">Projects</option>
      </SelectField>
      {role === 'admin' && <p>Admin applies to the whole workspace.</p>}
      {role !== 'admin' && scope === 'domains' && (
        <label>
          Domain IDs (comma separated)
          <input value={targets} onChange={event => setTargets(event.target.value)} />
          <small>Available: {projects.domains.map(domain => `${domain.id} (${domain.name})`).join(', ')}</small>
        </label>
      )}
      {role !== 'admin' && scope === 'projects' && (
        <label>
          Projects (comma separated)
          <input value={projectTargets} onChange={event => setProjectTargets(event.target.value)} />
          <small>Available: {Object.keys(projects.projects).join(', ')}</small>
        </label>
      )}
      <ReviewChange area="grants" changeLabel={changeLabel} proposal={proposal} baseVersion={version} onSaved={onSaved} disabled={!member.trim() || emptyScope || !proposed.addedBy} />
    </>
  );
}

/** Keeps Admin grants workspace-wide and parses other scope members. */
export function grantScope(role: string, scope: Grant['scope']['kind'], domains: string, projects: string): Grant['scope'] {
  if (role === 'admin' || scope === 'workspace') return { kind: 'workspace' };
  if (scope === 'domains') return { kind: 'domains', domains: commaList(domains) };
  return { kind: 'projects', projects: commaList(projects) };
}
