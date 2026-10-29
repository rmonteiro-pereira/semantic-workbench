/** Explains metric formulas, composition and rollup rules with SQL previews that are never
 * executed. */
import React, { useState } from 'react';
import { Ban, CalendarDays, Check, Copy, Filter, Layers3, ShieldAlert, ShieldCheck, Sigma, CircleSlash } from 'lucide-react';
import type { KpiExplanation, KpiSummary, TreeNode } from '../../server/agent/explain';
import type { ExplainQuery } from '../projects/api';
import { additivityLabel, divisionByZeroTitle, readableFormula, typeLabel } from './format';
import { SqlCode } from '../sql/SqlCode';
const GRAINS = ['day', 'week', 'month', 'quarter', 'year'];
const roleLabel = { numerator: 'Numerator', denominator: 'Denominator', input: 'Input' } as const;
// "How this metric is calculated": the formula in words, the composition tree down to fields, the
// rules that govern rollups, and a SQL preview that is never executed.
/** Displays a metric's formula, rollup rules and unexecuted SQL preview. */
export function Explanation({
  explanation: kpiExplanation,
  all,
  query,
  onQuery,
  loading,
}: {
  explanation: KpiExplanation;
  all: KpiSummary[];
  query: ExplainQuery;
  onQuery: (explainQuery: ExplainQuery) => void;
  loading: boolean;
}) {
  const labels = new Map(all.filter(k => k.file === kpiExplanation.kpi.file).map(k => [k.name, k.label]));
  const parts = readableFormula(kpiExplanation.formula, labels);
  const aggregation = kpiExplanation.inputs.length === 1 && kpiExplanation.inputs[0].metric === kpiExplanation.kpi.name ? kpiExplanation.inputs[0] : null;
  let formulaInWords: React.ReactNode;
  if (parts.length) {
    formulaInWords = (
      <p className="formula-readable" aria-label="Formula in words">
        {parts.map((part, i) => {
          if (part.kind === 'metric') {
            return (
              <span key={i} className="formula-metric">
                {part.text}
              </span>
            );
          }
          if (part.kind === 'op') {
            return (
              <span key={i} className="formula-op">
                {part.text}
              </span>
            );
          }
          return (
            <span key={i} className="formula-text">
              {part.text}
            </span>
          );
        })}
      </p>
    );
  } else if (aggregation) {
    formulaInWords = (
      <p className="formula-readable" aria-label="Formula in words">
        <span className="formula-agg">{aggregation.aggregation ?? 'Value'}</span>
        <span className="formula-text">of</span>
        {aggregation.fields.map((field, i) => (
          <span key={i} className="formula-field">
            {field.dataset}.{field.field}
          </span>
        ))}
      </p>
    );
  } else {
    formulaInWords = null;
  }
  let tone: 'ok' | 'warn' | 'muted' | 'bad' | 'plain' | undefined;
  if (kpiExplanation.kpi.additivity === 'additive') {
    tone = 'ok';
  } else if (kpiExplanation.kpi.additivity) {
    tone = 'warn';
  } else {
    tone = 'muted';
  }
  return (
    <section className="kpi-explanation" aria-labelledby="how-calculated">
      <h3 id="how-calculated">How this metric is calculated</h3>
      <div className="explain-step">
        <span className="step-number">1</span>
        <div className="step-body">
          <h4>Formula</h4>
          {formulaInWords}
          <pre className="formula-sql" aria-label="Governed expression">
            <code>{kpiExplanation.formula || 'No ANSI SQL expression'}</code>
          </pre>
        </div>
      </div>
      <div className="explain-step">
        <span className="step-number">2</span>
        <div className="step-body">
          <h4>Built from</h4>
          <CompositionTree node={kpiExplanation.tree} />
        </div>
      </div>
      <Step number={3} title="Rules">
        <div className="rule-grid">
          <Rule icon={<CalendarDays size={15} />} title="Time">
            {kpiExplanation.time ? (
              <>
                <code>{kpiExplanation.time.dimension}</code>
                <span>
                  {kpiExplanation.time.minGrain ? `From ${kpiExplanation.time.minGrain} upward: ` : 'Grains: '}
                  {kpiExplanation.time.allowedGrains.join(', ')}
                </span>
              </>
            ) : (
              <span className="muted">No time dimension declared.</span>
            )}
          </Rule>
          <Rule icon={<Layers3 size={15} />} title="Break down by">
            {kpiExplanation.dimensions.length ? (
              <span className="chip-row">
                {kpiExplanation.dimensions.map(d => (
                  <code key={d}>{d}</code>
                ))}
              </span>
            ) : (
              <span className="muted">No dimensions declared.</span>
            )}
          </Rule>
          <Rule icon={<Filter size={15} />} title="Filters">
            {kpiExplanation.filters.length ? kpiExplanation.filters.map((f, i) => <span key={i}>{f.text}</span>) : <span className="muted">No filters: every row counts.</span>}
          </Rule>
          <Rule icon={<Sigma size={15} />} title={kpiExplanation.kpi.additivity ? additivityLabel[kpiExplanation.kpi.additivity] : 'Additivity unknown'} tone={tone}>
            <span>{kpiExplanation.additivityText}</span>
          </Rule>
          <Rule
            icon={kpiExplanation.divisionByZero === 'unhandled' ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
            title={divisionByZeroTitle[kpiExplanation.divisionByZero]}
            tone={kpiExplanation.divisionByZero === 'unhandled' ? 'bad' : 'ok'}
          >
            <span>{kpiExplanation.divisionText}</span>
          </Rule>
          <Rule icon={<CircleSlash size={15} />} title="Missing values">
            <span>{kpiExplanation.missingValues}</span>
          </Rule>
        </div>
      </Step>
      <Step number={4} title="SQL preview">
        <Preview explanation={kpiExplanation} query={query} onQuery={onQuery} loading={loading} />
      </Step>
    </section>
  );
}
/** A numbered step of the explanation: a heading with its content below. */
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="explain-step">
      <span className="step-number">{number}</span>
      <div className="step-body">
        <h4>{title}</h4>
        {children}
      </div>
    </div>
  );
}
function Rule({ icon, title, tone = 'plain', children }: { icon: React.ReactNode; title: string; tone?: 'ok' | 'warn' | 'bad' | 'muted' | 'plain'; children: React.ReactNode }) {
  return (
    <div className={`rule tone-${tone}`}>
      <strong>
        {icon}
        {title}
      </strong>
      <div>{children}</div>
    </div>
  );
}
/** Renders a metric's nested expression and input composition. */
export function CompositionTree({ node, className = '' }: { node: TreeNode; className?: string }) {
  return (
    <ul className={`kpi-tree ${className}`} role="tree" aria-label="Composition tree">
      <Node node={node} root />
    </ul>
  );
}
function Node({ node, root = false }: { node: TreeNode; root?: boolean }) {
  const children = node.children.length > 0;
  return (
    <li
      role="treeitem"
      aria-expanded={children ? true : undefined}
      aria-label={`${node.role ? roleLabel[node.role] + ': ' : ''}${node.label ?? node.name}`}
      className={`tree-node kind-${node.kind}${root ? ' root' : ''}`}
    >
      <div className="tree-card">
        {node.role && <span className={`tree-role role-${node.role}`}>{roleLabel[node.role]}</span>}
        {node.kind === 'metric' ? (
          <>
            <strong>{node.label ?? node.name}</strong>
            {node.label !== node.name && <code className="tree-id">{node.name}</code>}
            {node.type && <span className={`kpi-pill type-${node.type}`}>{typeLabel[node.type]}</span>}
            {node.repeated && <small className="muted">cycle, shown once</small>}
            {node.expression && !root && <code className="tree-expr">{node.expression}</code>}
          </>
        ) : (
          <>
            <span className="tree-field">
              {node.dataset}.<strong>{node.name}</strong>
            </span>
            {node.expression && node.expression !== node.name && <code className="tree-expr">= {node.expression}</code>}
          </>
        )}
      </div>
      {children && (
        <ul role="group">
          {node.children.map((c, i) => (
            <Node key={i} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}
function Preview({ explanation: kpiExplanation, query, onQuery, loading }: { explanation: KpiExplanation; query: ExplainQuery; onQuery: (explainQuery: ExplainQuery) => void; loading: boolean }) {
  const sqlPreview = kpiExplanation.sqlPreview;
  const [copied, setCopied] = useState(false);
  const grains = kpiExplanation.time ? GRAINS : [];
  const dims = query.dimensions ?? [];
  const toggle = (dimension: string) =>
    onQuery({
      ...query,
      dimensions: dims.includes(dimension) ? dims.filter(x => x !== dimension) : [...dims, dimension],
    });
  return (
    <div className="sql-preview">
      <div className="preview-controls">
        {grains.length > 0 && (
          <label>
            Time grain
            <select aria-label="Time grain" value={query.grain ?? sqlPreview.grain ?? ''} onChange={ev => onQuery({ ...query, grain: ev.target.value })}>
              {grains.map(grain => (
                <option key={grain} value={grain} disabled={!kpiExplanation.time!.allowedGrains.includes(grain as any) && grain !== query.grain}>
                  {grain}
                  {kpiExplanation.time!.allowedGrains.includes(grain as any) ? '' : ' · not allowed'}
                </option>
              ))}
            </select>
          </label>
        )}
        {kpiExplanation.dimensions.length > 0 && (
          <fieldset>
            <legend>Break down by</legend>
            {kpiExplanation.dimensions.map(dimension => (
              <label key={dimension} className="check">
                <input type="checkbox" checked={dims.includes(dimension)} onChange={() => toggle(dimension)} />
                {dimension}
              </label>
            ))}
          </fieldset>
        )}
        <label className="check rollup">
          <input type="checkbox" aria-label="Sum the metric values" checked={query.rollup === 'sum'} onChange={ev => onQuery({ ...query, rollup: ev.target.checked ? 'sum' : undefined })} />
          Sum the metric values
        </label>
      </div>
      {'refused' in sqlPreview ? (
        <div className="preview-refused" role="alert">
          <Ban size={18} />
          <div>
            <strong>No SQL for this request</strong>
            <p>{sqlPreview.refused}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="preview-head">
            <span className="not-executed">Preview · not executed</span>
            {sqlPreview.joins.length > 0 && <span className="muted">Joins: {sqlPreview.joins.join(', ')}</span>}
            <button
              className="copy-sql"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(sqlPreview.sql)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(() => {});
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy SQL'}
            </button>
          </div>
          <pre className={`preview-sql${loading ? ' stale' : ''}`} aria-label="SQL preview, not executed">
            <code>
              <SqlCode sql={sqlPreview.sql} />
            </code>
          </pre>
          {sqlPreview.warnings.map(warning => (
            <p key={warning} className="preview-note">
              {warning}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
