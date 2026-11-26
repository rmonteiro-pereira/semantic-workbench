import type { ProjectsConfig } from './types';
import { LEVELS, type Level } from '../../shared/auth/actions';
import { SelectField } from './SelectField';
import { ListInput } from './ListInput';
import { WrappingField } from './WrappingField';
import { commaList } from './change-review';

type Project = ProjectsConfig['projects'][string];
/** Edits one project's access properties, with informational contacts kept separate from grants. */
export function ProjectFields({ slug, project, domains, onChange }: { slug: string; project: Project; domains: ProjectsConfig['domains']; onChange: (project: Project) => void }) {
  function changeRule(index: number, field: 'pattern' | 'groups' | 'emails', text: string) {
    const value = field === 'pattern' ? text : commaList(text);
    onChange({
      ...project,
      restricted: project.restricted.map((rule, position) => (position === index ? { ...rule, [field]: value } : rule)),
    });
  }
  function removeRestriction(index: number) {
    onChange({
      ...project,
      restricted: project.restricted.filter((_, position) => position !== index),
    });
  }
  function addRestriction() {
    onChange({
      ...project,
      restricted: [...project.restricted, { pattern: '', groups: [], emails: [] }],
    });
  }
  function changeLevel(value: string) {
    onChange({ ...project, protectedLevel: (value || undefined) as Level | undefined });
  }
  return (
    <fieldset>
      <legend>{slug}</legend>
      <SelectField label={`Domain for ${slug}`} value={project.domain ?? ''} onChange={event => onChange({ ...project, domain: event.target.value || undefined })}>
        <option value="">No domain</option>
        {domains.map(domain => (
          <option key={domain.id} value={domain.id}>
            {domain.name}
          </option>
        ))}
      </SelectField>
      <label>
        <input type="checkbox" checked={project.everyoneCanRead ?? false} onChange={event => onChange({ ...project, everyoneCanRead: event.target.checked })} />
        Every signed-in person may read this project, its history and exports
      </label>
      <label>
        Steward contacts (comma separated)
        <ListInput value={project.stewards} onChange={stewards => onChange({ ...project, stewards })} />
      </label>
      <p>These contacts grant no permissions. Assign roles in Access grants.</p>
      <label>
        Protected branches (comma separated)
        <ListInput value={project.protectedBranches} onChange={protectedBranches => onChange({ ...project, protectedBranches })} />
      </label>
      <SelectField label="Protected classification level" value={project.protectedLevel ?? ''} onChange={event => changeLevel(event.target.value)}>
        <option value="">Workspace default</option>
        {LEVELS.map(level => (
          <option key={level}>{level}</option>
        ))}
      </SelectField>
      <h4>Restricted paths</h4>
      <p className="admin-field-hint">A restricted path is hidden from everyone outside its listed groups and addresses, except Admins.</p>
      {project.restricted.map((rule, index) => (
        <fieldset key={index}>
          <legend>Restriction {index + 1}</legend>
          <label>
            Path pattern, such as private/**
            <WrappingField value={rule.pattern} onValueChange={pattern => changeRule(index, 'pattern', pattern)} />
          </label>
          <label>
            Groups allowed (comma separated)
            <ListInput value={rule.groups} onChange={values => changeRule(index, 'groups', values.join(', '))} />
          </label>
          <label>
            E-mail addresses allowed (comma separated)
            <ListInput value={rule.emails} onChange={values => changeRule(index, 'emails', values.join(', '))} />
          </label>
          <button className="admin-remove" onClick={() => removeRestriction(index)}>
            Remove restriction
          </button>
        </fieldset>
      ))}
      <button onClick={addRestriction}>Add restricted path</button>
    </fieldset>
  );
}
