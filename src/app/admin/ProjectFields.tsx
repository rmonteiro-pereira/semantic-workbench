import type { ProjectsConfig } from './types';
import { LEVELS, type Level } from '../../server/auth/actions';
import { SelectField } from './SelectField';
import { ListInput } from './ListInput';
import { commaList } from './change-review';

type Project = ProjectsConfig['projects'][string];
/** Edits one project's access properties, with informational contacts kept separate from grants. */
export function ProjectFields({
  slug,
  project,
  domains,
  onChange,
}: {
  slug: string;
  project: Project;
  domains: ProjectsConfig['domains'];
  onChange: (project: Project) => void;
}) {
  function changeRule(index: number, field: 'pattern' | 'groups' | 'emails', text: string) {
    const value = field === 'pattern' ? text : commaList(text);
    onChange({
      ...project,
      restricted: project.restricted.map((rule, position) =>
        position === index ? { ...rule, [field]: value } : rule,
      ),
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
      <SelectField
        label={`Domain for ${slug}`}
        value={project.domain ?? ''}
        onChange={event => onChange({ ...project, domain: event.target.value || undefined })}
      >
        <option value="">No domain</option>
        {domains.map(domain => (
          <option key={domain.id} value={domain.id}>
            {domain.name}
          </option>
        ))}
      </SelectField>
      <label>
        <input
          type="checkbox"
          checked={project.everyoneCanRead ?? false}
          onChange={event => onChange({ ...project, everyoneCanRead: event.target.checked })}
        />
        Everyone with access can read
      </label>
      <label>
        Listed Stewards (informational)
        <ListInput
          value={project.stewards}
          onChange={stewards => onChange({ ...project, stewards })}
        />
      </label>
      <p>These contacts grant no permissions. Assign roles in Access grants.</p>
      <label>
        Protected branches
        <ListInput
          value={project.protectedBranches}
          onChange={protectedBranches => onChange({ ...project, protectedBranches })}
        />
      </label>
      <SelectField
        label="Protected classification level"
        value={project.protectedLevel ?? ''}
        onChange={event => changeLevel(event.target.value)}
      >
        <option value="">Workspace default</option>
        {LEVELS.map(level => (
          <option key={level}>{level}</option>
        ))}
      </SelectField>
      <h4>Restricted paths</h4>
      {project.restricted.map((rule, index) => (
        <fieldset key={index}>
          <legend>Restriction {index + 1}</legend>
          <label>
            Pattern
            <input
              value={rule.pattern}
              onChange={event => changeRule(index, 'pattern', event.target.value)}
            />
          </label>
          <label>
            Groups
            <ListInput
              value={rule.groups}
              onChange={values => changeRule(index, 'groups', values.join(', '))}
            />
          </label>
          <label>
            E-mail addresses
            <ListInput
              value={rule.emails}
              onChange={values => changeRule(index, 'emails', values.join(', '))}
            />
          </label>
          <button onClick={() => removeRestriction(index)}>Remove restriction</button>
        </fieldset>
      ))}
      <button onClick={addRestriction}>Add restricted path</button>
    </fieldset>
  );
}
