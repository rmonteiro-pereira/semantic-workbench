import { useState } from 'react';
import { AdminPane, type PaneProps } from './AdminPane';
import { SelectField } from './SelectField';
import { CodeEditor } from '../editor/CodeEditor';
import { adminApi, problemText } from './api';
import { ReviewChange } from './ReviewChange';
import { PolicyTemplateForm } from './PolicyTemplateForm';
import { ProjectAccessSection } from './ProjectAccessSection';
import type { Policy } from './types';
import type { Issue } from '../validation/diagnostics';

const templates = [
  'Metric ownership and steward',
  'Git action limits',
  'Classification level for editing',
  'Branch protection',
  'Agent client scope',
  'Time condition',
  'Network condition',
];
const dataTemplates = [
  'Classification level for editing',
  'Branch protection',
  'Agent client scope',
];
// The editor has no Cedar grammar; a .txt name keeps it from highlighting the rule as YAML.
function policyEditorFilename(id: string): string {
  return id + '.txt';
}
/** Edits raw Cedar with inline server validation, or constructs it from structured parameters. */
export function PolicyEditor({
  initial,
  rules,
  version,
  onBack,
  onSaved,
}: PaneProps & { initial: Policy; rules: Policy[]; version: string; onSaved: () => void }) {
  const [policy, setPolicy] = useState(initial);
  const [template, setTemplate] = useState(initial.template ?? templates[0]);
  const [advanced, setAdvanced] = useState(Boolean(initial.text));
  const [projects, setProjects] = useState(false);
  const [validated, setValidated] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState('');
  const proposal = { rules: [...rules.filter(rule => rule.id !== policy.id), policy] };
  const key = JSON.stringify(proposal);
  async function validate(text: string): Promise<Issue[]> {
    const proposedRules = [...rules.filter(rule => rule.id !== policy.id), { ...policy, text }];
    try {
      const result = await adminApi.validate(proposedRules);
      return result.errors.map(issue => ({
        severity: 'error',
        code: 'policy',
        path: issue.id,
        message: issue.message,
        line: issue.line,
        column: issue.column,
      }));
    } catch (problem) {
      return [
        { severity: 'error', code: 'policy', path: policy.id, message: problemText(problem) },
      ];
    }
  }
  async function validateProposal() {
    setValidated('');
    setError('');
    try {
      const result = await adminApi.validate(proposal.rules);
      setIssues(
        result.errors.map(issue => ({
          severity: 'error',
          code: 'policy',
          path: issue.id,
          message: issue.message,
          line: issue.line,
          column: issue.column,
        })),
      );
      if (result.ok && !result.errors.length) setValidated(key);
    } catch (problem) {
      setError(problemText(problem));
    }
  }
  function applyTemplate(text: string) {
    setPolicy({ ...policy, text, template });
    setAdvanced(true);
    setValidated('');
  }
  if (projects) {
    return (
      <AdminPane
        title="Project access for this rule"
        backLabel="Back to policy editor"
        onBack={() => {
          setProjects(false);
          onSaved();
        }}
      >
        <ProjectAccessSection />
      </AdminPane>
    );
  }
  return (
    <AdminPane title="Policy editor" backLabel="Back to policies" onBack={onBack}>
      <label>
        Description
        <input
          value={policy.description}
          onChange={event => setPolicy({ ...policy, description: event.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={advanced}
          onChange={event => setAdvanced(event.target.checked)}
        />
        Advanced raw editor
      </label>
      {!advanced && (
        <>
          <SelectField
            label="Template"
            value={template}
            onChange={event => setTemplate(event.target.value)}
          >
            {templates.map(name => (
              <option key={name}>{name}</option>
            ))}
          </SelectField>
          {dataTemplates.includes(template) ? (
            <>
              <p>This template changes project or agent configuration.</p>
              <button onClick={() => setProjects(true)}>Configure {template.toLowerCase()}</button>
            </>
          ) : (
            <PolicyTemplateForm
              key={template}
              id={policy.id}
              template={template}
              onApply={applyTemplate}
            />
          )}
        </>
      )}
      {advanced && (
        <CodeEditor
          value={policy.text}
          filename={policyEditorFilename(policy.id)}
          ariaLabel="Policy source"
          onChange={text => setPolicy({ ...policy, text })}
          validate={validate}
        />
      )}
      <button onClick={validateProposal}>Validate</button>
      {error && <p role="alert">{error}</p>}
      {issues.map((issue, index) => (
        <p role="alert" key={index}>
          Line {issue.line}, column {issue.column}: {issue.message}
        </p>
      ))}
      {validated === key && <p>Policy is valid.</p>}
      <ReviewChange
        area="policies"
        changeLabel={`Save policy ${policy.description || policy.id}`}
        proposal={proposal}
        baseVersion={version}
        disabled={validated !== key}
        onSaved={onSaved}
      />
    </AdminPane>
  );
}
