import React, { useState } from 'react';
import {
  Ban,
  CalendarDays,
  Check,
  Copy,
  Filter,
  Layers3,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  CircleSlash,
} from 'lucide-react';
import type { KpiExplanation, KpiSummary, TreeNode } from '../../server/agent/explain';
import type { ExplainQuery } from '../projects/api';
import { additivityLabel, readableFormula, typeLabel } from './format';
import { SqlCode } from '../sql/SqlCode';
const GRAINS = ['day', 'week', 'month', 'quarter', 'year'];
const roleLabel = { numerator: 'Numerator', denominator: 'Denominator', input: 'Input' } as const;
// "How this metric is calculated" (FR-002, FR-006, FR-007): the formula in words, the composition tree down to
// fields, the rules that govern rollups, and a SQL preview that is never executed.
export function Explanation({
  explanation: e,
  all,
  query,
  onQuery,
  loading,
}: {
  explanation: KpiExplanation;
  all: KpiSummary[];
  query: ExplainQuery;
  onQuery: (q: ExplainQuery) => void;
  loading: boolean;
}) {
  const labels = new Map(all.filter(k => k.file === e.kpi.file).map(k => [k.name, k.label]));
  const parts = readableFormula(e.formula, labels);
  const aggregation =
    e.inputs.length === 1 && e.inputs[0].metric === e.kpi.name ? e.inputs[0] : null;
  return (
    <section className="kpi-explanation" aria-labelledby="how-calculated">
      <h3 id="how-calculated">How this metric is calculated</h3>
      <div className="explain-step">
        <span className="step-number">1</span>
        <div className="step-body">
          <h4>Formula</h4>
          {parts.length ? (
            <p className="formula-readable" aria-label="Formula in words">
              {parts.map((p, i) =>
                p.kind === 'metric' ? (
                  <span key={i} className="formula-metric">
                    {p.text}
                  </span>
                ) : p.kind === 'op' ? (
                  <span key={i} className="formula-op">
                    {p.text}
                  </span>
                ) : (
                  <span key={i} className="formula-text">
                    {p.text}
                  </span>
                ),
              )}
            </p>
          ) : aggregation ? (
            <p className="formula-readable" aria-label="Formula in words">
              <span className="formula-agg">{aggregation.aggregation ?? 'Value'}</span>
              <span className="formula-text">of</span>
              {aggregation.fields.map((f, i) => (
                <span key={i} className="formula-field">
                  {f.dataset}.{f.field}
                </span>
              ))}
            </p>
          ) : null}
          <pre className="formula-sql" aria-label="Governed expression">
            <code>{e.formula || 'No ANSI SQL expression'}</code>
          </pre>
        </div>
      </div>
      <div className="explain-step">
        <span className="step-number">2</span>
        <div className="step-body">
          <h4>Built from</h4>
          <CompositionTree node={e.tree} />
        </div>
      </div>
      <div className="explain-step">
        <span className="step-number">3</span>
        <div className="step-body">
          <h4>Rules</h4>
          <div className="rule-grid">
            <Rule icon={<CalendarDays size={15} />} title="Time">
              {e.time ? (
                <>
                  <code>{e.time.dimension}</code>
                  <span>
                    {e.time.minGrain ? `From ${e.time.minGrain} upward: ` : 'Grains: '}
                    {e.time.allowedGrains.join(', ')}
                  </span>
                </>
              ) : (
                <span className="muted">No time dimension declared.</span>
              )}
            </Rule>
            <Rule icon={<Layers3 size={15} />} title="Break down by">
              {e.dimensions.length ? (
                <span className="chip-row">
                  {e.dimensions.map(d => (
                    <code key={d}>{d}</code>
                  ))}
                </span>
              ) : (
                <span className="muted">No dimensions declared.</span>
              )}
            </Rule>
            <Rule icon={<Filter size={15} />} title="Filters">
              {e.filters.length ? (
                e.filters.map((f, i) => <span key={i}>{f.text}</span>)
              ) : (
                <span className="muted">No filters: every row counts.</span>
              )}
            </Rule>
            <Rule
              icon={<Sigma size={15} />}
              title={e.kpi.additivity ? additivityLabel[e.kpi.additivity] : 'Additivity unknown'}
              tone={e.kpi.additivity === 'additive' ? 'ok' : e.kpi.additivity ? 'warn' : 'muted'}
            >
              <span>{e.additivityText}</span>
            </Rule>
            <Rule
              icon={
                e.divisionByZero === 'unhandled' ? (
                  <ShieldAlert size={15} />
                ) : (
                  <ShieldCheck size={15} />
                )
              }
              title={
                e.divisionByZero === 'handled'
                  ? 'Division by zero guarded'
                  : e.divisionByZero === 'unhandled'
                    ? 'Division by zero not guarded'
                    : 'No division'
              }
              tone={e.divisionByZero === 'unhandled' ? 'bad' : 'ok'}
            >
              <span>{e.divisionText}</span>
            </Rule>
            <Rule icon={<CircleSlash size={15} />} title="Missing values">
              <span>{e.missingValues}</span>
            </Rule>
          </div>
        </div>
      </div>
      <div className="explain-step">
        <span className="step-number">4</span>
        <div className="step-body">
          <h4>SQL preview</h4>
          <Preview e={e} query={query} onQuery={onQuery} loading={loading} />
        </div>
      </div>
    </section>
  );
}
function Rule({
  icon,
  title,
  tone = 'plain',
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: 'ok' | 'warn' | 'bad' | 'muted' | 'plain';
  children: React.ReactNode;
}) {
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
            {node.type && (
              <span className={`kpi-pill type-${node.type}`}>{typeLabel[node.type]}</span>
            )}
            {node.repeated && <small className="muted">cycle, shown once</small>}
            {node.expression && !root && <code className="tree-expr">{node.expression}</code>}
          </>
        ) : (
          <>
            <span className="tree-field">
              {node.dataset}.<strong>{node.name}</strong>
            </span>
            {node.expression && node.expression !== node.name && (
              <code className="tree-expr">= {node.expression}</code>
            )}
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
function Preview({
  e,
  query,
  onQuery,
  loading,
}: {
  e: KpiExplanation;
  query: ExplainQuery;
  onQuery: (q: ExplainQuery) => void;
  loading: boolean;
}) {
  const p = e.sqlPreview,
    [copied, setCopied] = useState(false);
  const grains = e.time ? GRAINS : [];
  const dims = query.dimensions ?? [];
  const toggle = (d: string) =>
    onQuery({ ...query, dimensions: dims.includes(d) ? dims.filter(x => x !== d) : [...dims, d] });
  return (
    <div className="sql-preview">
      <div className="preview-controls">
        {grains.length > 0 && (
          <label>
            Time grain
            <select
              aria-label="Time grain"
              value={query.grain ?? p.grain ?? ''}
              onChange={ev => onQuery({ ...query, grain: ev.target.value })}
            >
              {grains.map(g => (
                <option
                  key={g}
                  value={g}
                  disabled={!e.time!.allowedGrains.includes(g as any) && g !== query.grain}
                >
                  {g}
                  {e.time!.allowedGrains.includes(g as any) ? '' : ' · not allowed'}
                </option>
              ))}
            </select>
          </label>
        )}
        {e.dimensions.length > 0 && (
          <fieldset>
            <legend>Break down by</legend>
            {e.dimensions.map(d => (
              <label key={d} className="check">
                <input type="checkbox" checked={dims.includes(d)} onChange={() => toggle(d)} />
                {d}
              </label>
            ))}
          </fieldset>
        )}
        <label className="check rollup">
          <input
            type="checkbox"
            aria-label="Sum the metric values"
            checked={query.rollup === 'sum'}
            onChange={ev => onQuery({ ...query, rollup: ev.target.checked ? 'sum' : undefined })}
          />
          Sum the metric values
        </label>
      </div>
      {'refused' in p ? (
        <div className="preview-refused" role="alert">
          <Ban size={18} />
          <div>
            <strong>No SQL for this request</strong>
            <p>{p.refused}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="preview-head">
            <span className="not-executed">Preview · not executed</span>
            {p.joins.length > 0 && <span className="muted">Joins: {p.joins.join(', ')}</span>}
            <button
              className="copy-sql"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(p.sql)
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
          <pre
            className={`preview-sql${loading ? ' stale' : ''}`}
            aria-label="SQL preview, not executed"
          >
            <code>
              <SqlCode sql={p.sql} />
            </code>
          </pre>
          {p.warnings.map(w => (
            <p key={w} className="preview-note">
              {w}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
