import { adminApi, problemText } from './api';
import { useState } from 'react';
import { templateRequest, type PolicyParameters } from './policy-templates';

/** Collects structured rule parameters; the server generates the rule text for validation. */
export function PolicyTemplateForm({
  id,
  template,
  onApply,
}: {
  id: string;
  template: string;
  onApply: (text: string) => void;
}) {
  const [parameters, setParameters] = useState<PolicyParameters>({
    template,
    domain: '',
    groups: '',
    role: 'editor',
    actions: 'push',
    branch: 'main',
    start: 9,
    end: 17,
    ranges: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fields = template === 'Metric ownership and steward' ? ['domain', 'groups'] : ['actions'];
  if (template === 'Git action limits') fields.push('role', 'branch');
  if (template === 'Time condition') fields.push('start', 'end');
  if (template === 'Network condition') fields.push('ranges');
  function change(field: string, value: string) {
    setParameters({
      ...parameters,
      [field]: field === 'start' || field === 'end' ? Number(value) : value,
    });
  }
  async function apply() {
    setBusy(true);
    try {
      const rule = await adminApi.policyTemplate(templateRequest({ ...parameters, template }, id));
      onApply(rule.text);
      setError('');
    } catch (problem) {
      setError(problemText(problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset>
      <legend>{template}</legend>
      {fields.map(field => (
        <label key={field}>
          {field}
          <input
            value={parameters[field as keyof PolicyParameters]}
            onChange={event => change(field, event.target.value)}
          />
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={apply}>
        Use template
      </button>
    </fieldset>
  );
}
