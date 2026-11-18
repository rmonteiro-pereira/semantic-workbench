/** Agent context of a concept or relationship in the details panel: three separate fields and a preview of what an agent receives. */
import React, { useState } from 'react';
import { applyPatches } from '../../shared/editor/patch';
import { itemValue, valuePatches } from '../../shared/edit/yaml-patch';
import { contextOfFields, contextProblem, fieldsOfContext, type ContextFields } from '../../shared/governance/agent-context-edit';
import { AI_CONTEXT_PROPERTY } from '../../shared/tessera/additions/ai-context';
import { validateInput } from '../../shared/validation/input';
import type { SectionState } from '../attributes/AttributeList';
import { useCapabilities } from '../auth/Capabilities';
import { useRevisionGate } from '../edit/RevisionConfirmation';
import { saveWrites } from '../edit/save-writes';
import type { DetailsSection } from '../edit/section-context';
import { AgentContextPreview } from './AgentContextPreview';
import '../edit/edit.css';
import './agent-context.css';

type ViewProps = {
  initial: ContextFields;
  readOnlyReason?: string;
  state?: SectionState;
  message: string;
  saving: boolean;
  onSave: (fields: ContextFields) => void;
};

/** The section as the person sees it, for every state. */
export function AgentContextSectionView({ initial, readOnlyReason, state = { kind: 'ready' }, message, saving, onSave }: ViewProps) {
  const [fields, setFields] = useState<ContextFields>(initial);
  const problem = contextProblem(fields);
  const field = (name: keyof ContextFields) => ({
    value: fields[name],
    disabled: saving || !!readOnlyReason,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setFields(previous => ({ ...previous, [name]: event.target.value })),
  });
  let body: React.ReactNode;
  if (state.kind === 'loading')
    body = (
      <p className="agent-context-placeholder" role="status">
        Loading agent context…
      </p>
    );
  else if (state.kind === 'error')
    body = (
      <div role="alert" className="agent-context-error">
        <p>{state.message}</p>
        <button type="button" onClick={state.retry}>
          Try again
        </button>
      </div>
    );
  else
    body = (
      <>
        {readOnlyReason && <p className="hint">{readOnlyReason}</p>}
        <div className="item-fields agent-context-fields">
          <label>
            <span>Instructions</span>
            <textarea rows={3} {...field('instructions')} spellCheck />
            <small>How an agent should use this item.</small>
          </label>
          <label>
            <span>Synonyms</span>
            <textarea rows={2} {...field('synonyms')} />
            <small>Other names people use, one per line.</small>
          </label>
          <label>
            <span>Examples</span>
            <textarea rows={2} {...field('examples')} />
            <small>Questions this item helps answer, one per line.</small>
          </label>
        </div>
        {problem && (
          <p role="alert" className="dialog-error">
            {problem}
          </p>
        )}
        <AgentContextPreview fields={fields} unpublished />
        {!readOnlyReason && (
          <button type="button" className="primary" disabled={saving || !!problem} onClick={() => onSave(fields)}>
            {saving ? 'Saving…' : 'Save agent context'}
          </button>
        )}
      </>
    );
  return (
    <section className="agent-context-section" aria-label="Agent context">
      <div className="section-label">AGENT CONTEXT</div>
      {body}
      {message && (
        <p role="alert" className="dialog-error">
          {message}
        </p>
      )}
    </section>
  );
}

/** Reads and writes the agent context of one item, with the revision question in front of the write. */
export function AgentContextSection({ section }: { section: DetailsSection }) {
  const access = useCapabilities(section.doc.project);
  const { gate, dialog } = useRevisionGate(section.doc);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const item = itemValue(section.doc.source, section.itemPath) ?? {};
  const initial = fieldsOfContext(item[AI_CONTEXT_PROPERTY]);

  async function write(fields: ContextFields, raise: (text: string) => string) {
    const written = applyPatches(section.doc.source, valuePatches(section.doc.source, [...section.itemPath, AI_CONTEXT_PROPERTY], contextOfFields(fields), section.doc.filename));
    const source = raise(written);
    const errors = validateInput(source, section.doc.filename).issues.filter(issue => issue.severity === 'error');
    if (errors.length) return setMessage(`The change would not be valid: ${errors[0].message}`);
    setSaving(true);
    try {
      section.applySaved(await saveWrites(section.doc.project, [{ doc: section.doc, source }]), 'Saved agent context.');
      setMessage('');
    } catch (problem) {
      setMessage((problem as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AgentContextSectionView
        key={JSON.stringify(initial)}
        initial={initial}
        readOnlyReason={access.can('edit') ? undefined : access.control('edit').title}
        message={message}
        saving={saving}
        onSave={fields => void gate(finish => write(fields, finish))}
      />
      {dialog}
    </>
  );
}
