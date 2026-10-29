/** Resolves ODCS foreign keys within a contract and records external references separately. */
// Property-level relationships use their property as the source; schema-level ones name both ends.
// References accept object.property or schema/<id>/properties/<id> notation. Targets in another
// contract remain external.
/** Identifies a resolved foreign key between properties in one contract. */
export type OdcsForeignKey = {
  from: number;
  to: number;
  label: string;
  path: (string | number)[];
  definition: any;
  fromColumns: string[];
  toColumns: string[];
};
/** Describes a foreign-key target declared outside the current contract. */
export type OdcsExternalForeignKey = {
  from: number;
  fromColumns: string[];
  reference: string;
  path: (string | number)[];
};
/** Reports an unresolved contract reference at its document path. */
export type OdcsReferenceIssue = { path: string; message: string };
const list = (v: unknown) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
type Resolved = { object: number; column: string | undefined } | 'external' | undefined;
// Column paths are property names joined by '.' (nested properties: `parent.child`). Property ids
// of fully qualified references resolve to the same names.
function resolver(schema: any[]) {
  const byName = new Map<string, number>();
  const byId = new Map<string, number>();
  schema.forEach((x, i) => {
    if (x && typeof x === 'object') {
      if (typeof x.name === 'string') byName.set(x.name, i);
      if (typeof x.id === 'string') byId.set(x.id, i);
    }
  });
  const propertyPath = (object: number, ids: string[]) => {
    let props: any[] = Array.isArray(schema[object]?.properties) ? schema[object].properties : [];
    const names: string[] = [];
    for (const id of ids) {
      const p = props.find(x => x && typeof x === 'object' && (x.id === id || x.name === id));
      if (!p) return undefined;
      names.push(String(p.name));
      props = Array.isArray(p.properties) ? p.properties : [];
    }
    return names.join('.');
  };
  return (ref: unknown): Resolved => {
    if (typeof ref !== 'string') return undefined;
    if (/\.ya?ml#/.test(ref)) return 'external';
    const qualified = /^\/?schema\/([^/]+)((?:\/properties\/[^/]+)*)\/?$/.exec(ref);
    if (qualified) {
      const object = byId.get(qualified[1]) ?? byName.get(qualified[1]);
      if (object === undefined) return undefined;
      const ids = qualified[2].split('/properties/').filter(Boolean);
      return { object, column: ids.length ? propertyPath(object, ids) : undefined };
    }
    const loose = /^\/?schema\/([^/]+)/.exec(ref);
    if (loose) {
      const object = byId.get(loose[1]) ?? byName.get(loose[1]);
      return object === undefined ? undefined : { object, column: undefined };
    }
    const dot = ref.indexOf('.');
    if (dot <= 0) return undefined;
    const object = byName.get(ref.slice(0, dot));
    return object === undefined ? undefined : { object, column: ref.slice(dot + 1) };
  };
}
function collect(data: any) {
  const schema = Array.isArray(data?.schema) ? data.schema : [];
  const resolve = resolver(schema);
  const keys: OdcsForeignKey[] = [];
  const external: OdcsExternalForeignKey[] = [];
  const issues: OdcsReferenceIssue[] = [];
  const add = (
    from: number,
    fromColumns: (string | undefined)[],
    toRef: unknown,
    label: string,
    path: (string | number)[],
    definition: any,
  ) => {
    const targets = list(toRef);
    const first = targets[0];
    const target = resolve(first);
    if (target === 'external') {
      external.push({
        from,
        fromColumns: fromColumns.filter((c): c is string => !!c),
        reference: String(first),
        path,
      });
      return;
    }
    if (target === undefined) {
      issues.push({
        path: '/' + [...path, 'to'].join('/'),
        message: `Relationship target "${String(first)}" is not an object of this contract.`,
      });
      return;
    }
    let toColumns = targets.map(t => {
      const r = resolve(t);
      return r && r !== 'external' && r.object === target.object ? r.column : undefined;
    });
    let pairedFrom = fromColumns;
    if (toColumns.length !== fromColumns.length) {
      issues.push({
        path: '/' + [...path, 'to'].join('/'),
        message: `Composite foreign key pairs ${fromColumns.length} source column${fromColumns.length === 1 ? '' : 's'} with ${toColumns.length} target column${toColumns.length === 1 ? '' : 's'}; both lists must have the same length.`,
      });
      pairedFrom = [];
      toColumns = [];
    }
    const ok = pairedFrom.every(Boolean) && toColumns.every(Boolean);
    keys.push({
      from,
      to: target.object,
      label,
      path,
      definition,
      fromColumns: ok ? (pairedFrom as string[]) : [],
      toColumns: ok ? (toColumns as string[]) : [],
    });
  };
  schema.forEach((x: any, i: number) => {
    if (!x || typeof x !== 'object') return;
    (Array.isArray(x.properties) ? x.properties : []).forEach((p: any, j: number) =>
      (Array.isArray(p?.relationships) ? p.relationships : []).forEach((r: any, k: number) => {
        if (r && typeof r === 'object')
          add(
            i,
            [String(p.name)],
            r.to,
            String(p.name),
            ['schema', i, 'properties', j, 'relationships', k],
            { from: `${x.name}.${p.name}`, ...r },
          );
      }),
    );
    (Array.isArray(x.relationships) ? x.relationships : []).forEach((r: any, k: number) => {
      if (!r || typeof r !== 'object') return;
      const sources = list(r.from).map(f => resolve(f));
      const from = sources[0];
      const path = ['schema', i, 'relationships', k];
      if (from === undefined || from === 'external') {
        if (from !== 'external')
          issues.push({
            path: '/' + [...path, 'from'].join('/'),
            message: `Relationship source "${String(list(r.from)[0])}" is not an object of this contract.`,
          });
        return;
      }
      add(
        from.object,
        sources.map(s =>
          s && s !== 'external' && s.object === from.object ? s.column : undefined,
        ),
        r.to,
        list(r.from)
          .map(f => String(f).split('.').pop())
          .join(', '),
        path,
        r,
      );
    });
  });
  return { keys, external, issues };
}
/** Returns foreign keys resolved within the contract. */
export const odcsForeignKeys = (data: any) => collect(data).keys;
/** Returns declared foreign keys targeting another contract. */
export const odcsExternalForeignKeys = (data: any) => collect(data).external;
/** Returns findings for contract references that cannot be resolved. */
export const odcsReferenceIssues = (data: any) => collect(data).issues;
