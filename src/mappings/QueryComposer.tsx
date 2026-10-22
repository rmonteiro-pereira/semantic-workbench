/** Dialog that composes a governed query from mapped metrics and fields, and previews its SQL. */
import React from 'react';
import type { RuntimeContext } from '../../server/agent/runtime';
import { Modal } from '../projects/Modal';
import { SqlCode } from '../sql/SqlCode';

type Metric = RuntimeContext['metrics'][number];
type Field = RuntimeContext['fields'][number];

// The governed metric's ANSI SQL formula, shown next to its name; the composer never edits it.
function formulaOf(metric: Metric) {
  const dialects: { dialect: string; expression: string }[] =
    metric.definition?.expression?.dialects ?? [];
  const ansi = dialects.find(entry => entry.dialect === 'ANSI_SQL');
  return ansi?.expression ?? 'No ANSI_SQL expression';
}

type Props = {
  governed: Metric[];
  fields: Field[];
  metrics: string[];
  dimensions: string[];
  onToggleMetric: (id: string) => void;
  onToggleDimension: (id: string) => void;
  canPreview: boolean;
  loading: boolean;
  plan: any;
  error: string;
  onPreview: () => void;
  onClose: () => void;
};

/** Lets the user pick governed metrics and group-by fields, then shows the SQL; nothing runs. */
export function QueryComposer(props: Props) {
  const footer = (
    <>
      <span className="dialog-footer-spacer" />
      <button type="button" onClick={props.onClose}>
        Close
      </button>
      <button
        type="button"
        className="primary"
        onClick={props.onPreview}
        disabled={!props.canPreview}
      >
        Preview governed query
      </button>
    </>
  );
  return (
    <Modal title="Compose a query" onCancel={props.onClose} footer={footer} size="large">
      <div className="mapping-query">
        <p className="dialog-intro">
          Select mapped building blocks. Governed formulas remain unchanged; joins must be declared
          in the semantic model. The SQL is shown, never run.
        </p>
        <fieldset>
          <legend>Governed metrics</legend>
          {!props.governed.length && <p>No metrics mapped to this selection.</p>}
          {props.governed.map(metric => (
            <label key={metric.id}>
              <input
                type="checkbox"
                aria-label={`Metric ${metric.name}`}
                checked={props.metrics.includes(metric.id)}
                onChange={() => props.onToggleMetric(metric.id)}
              />
              {metric.name}
              <code>{formulaOf(metric)}</code>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Group by mapped fields</legend>
          {!props.fields.length && <p>No fields mapped to this selection.</p>}
          {props.fields.map(field => (
            <label key={field.id}>
              <input
                type="checkbox"
                aria-label={`Dimension ${field.dataset}.${field.name}`}
                checked={props.dimensions.includes(field.id)}
                onChange={() => props.onToggleDimension(field.id)}
              />
              {field.dataset}.{field.name}
            </label>
          ))}
        </fieldset>
        {props.loading && <p role="status">Composing the query…</p>}
        {props.error && (
          <p role="alert" className="mapping-error">
            {props.error}
          </p>
        )}
        {props.plan && (
          <div className="mapping-plan">
            <h4>SQL preview · not executed</h4>
            <pre aria-label="Governed SQL preview">
              <SqlCode sql={props.plan.sql} />
            </pre>
            <details>
              <summary>Query provenance</summary>
              <pre>{JSON.stringify(props.plan, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </Modal>
  );
}
