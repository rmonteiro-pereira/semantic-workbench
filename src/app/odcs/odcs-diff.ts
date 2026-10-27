/** Compares contract attributes and nested properties, matching by shared IDs or otherwise by
 * name. */
// Objects and properties match by ID when both versions provide one, otherwise by name. Nested
// properties use dotted paths, and all attributes participate in the comparison.
/** Records an attribute's value before and after a contract edit. */
export type AttributeChange = { attribute: string; before: unknown; after: unknown };
/** Records changes to one nested property path. */
export type PropertyChange = {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  changes: AttributeChange[];
};
/** Groups an object's attribute and property changes. */
export type ObjectDiff = {
  object: string;
  kind: 'added' | 'removed' | 'changed';
  attributes: AttributeChange[];
  properties: PropertyChange[];
};
/** Groups contract-level changes and changed schema objects. */
export type ContractDiff = { contract: AttributeChange[]; objects: ObjectDiff[] };
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Serializes values with sorted keys so key order does not count as a change. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (isObject(v))
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map(k => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v) ?? 'undefined';
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
// The attribute-level differences of two mappings, leaving out the keys handled elsewhere.
function attributeChanges(
  a: Record<string, any>,
  b: Record<string, any>,
  skip: string[],
): AttributeChange[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(k => !skip.includes(k))
    .sort();
  return keys
    .filter(k => !same(a[k], b[k]))
    .map(k => ({ attribute: k, before: a[k], after: b[k] }));
}
const keyOf = (x: any, useId: boolean) =>
  useId && typeof x?.id === 'string' ? 'id:' + x.id : 'name:' + String(x?.name);
function matchBy(before: any[], after: any[]) {
  const useId = [...before, ...after].every(x => typeof x?.id === 'string');
  return { useId, key: (x: any) => keyOf(x, useId) };
}

/** Flattens nested properties into paths with their own non-child attributes. */
export function flattenProperties(
  props: unknown,
  prefix = '',
): { path: string; property: Record<string, any> }[] {
  return list(props)
    .filter(isObject)
    .flatMap(p => {
      const path = prefix + String(p.name ?? '?');
      const nested = [
        ...flattenProperties(p.properties, path + '.'),
        ...(isObject(p.items)
          ? [
              { path: path + '[]', property: p.items },
              ...flattenProperties(p.items.properties, path + '[].'),
            ]
          : []),
      ];
      return [{ path, property: p }, ...nested];
    });
}
const CHILDREN = ['properties', 'items'];
function propertyDiff(a: unknown, b: unknown): PropertyChange[] {
  const before = flattenProperties(a);
  const after = flattenProperties(b);
  const ids =
    before.every(x => typeof x.property.id === 'string') &&
    after.every(x => typeof x.property.id === 'string');
  const k = (x: { path: string; property: any }) => (ids ? 'id:' + x.property.id : x.path);
  const old = new Map(before.map(x => [k(x), x]));
  const now = new Map(after.map(x => [k(x), x]));
  const out: PropertyChange[] = [];
  for (const x of before)
    if (!now.has(k(x))) out.push({ path: x.path, kind: 'removed', changes: [] });
  for (const x of after) {
    const o = old.get(k(x));
    if (!o) {
      out.push({ path: x.path, kind: 'added', changes: [] });
      continue;
    }
    const changes = attributeChanges(o.property, x.property, CHILDREN);
    if (o.path !== x.path) changes.unshift({ attribute: 'path', before: o.path, after: x.path });
    if (changes.length) out.push({ path: x.path, kind: 'changed', changes });
  }
  return out;
}
/** Compares all contract and object attributes across two versions. */
export function diffContracts(before: any, after: any): ContractDiff {
  const a = isObject(before) ? before : {};
  const b = isObject(after) ? after : {};
  const objsA = list(a.schema).filter(isObject);
  const objsB = list(b.schema).filter(isObject);
  const m = matchBy(objsA, objsB);
  const old = new Map(objsA.map(o => [m.key(o), o]));
  const now = new Map(objsB.map(o => [m.key(o), o]));
  const objects: ObjectDiff[] = [];
  for (const o of objsA)
    if (!now.has(m.key(o)))
      objects.push({
        object: String(o.name),
        kind: 'removed',
        attributes: [],
        properties: flattenProperties(o.properties).map(p => ({
          path: p.path,
          kind: 'removed',
          changes: [],
        })),
      });
  for (const o of objsB) {
    const p = old.get(m.key(o));
    if (!p) {
      objects.push({
        object: String(o.name),
        kind: 'added',
        attributes: [],
        properties: flattenProperties(o.properties).map(x => ({
          path: x.path,
          kind: 'added',
          changes: [],
        })),
      });
      continue;
    }
    const attributes = attributeChanges(p, o, ['properties']);
    const properties = propertyDiff(p.properties, o.properties);
    if (attributes.length || properties.length)
      objects.push({ object: String(o.name), kind: 'changed', attributes, properties });
  }
  return { contract: attributeChanges(a, b, ['schema']), objects };
}

/** Returns one object's changes, or null when unchanged or absent from both versions. */
export function diffObject(before: any, after: any, name: string): ObjectDiff | null {
  const pick = (c: any) =>
    list(c?.schema)
      .filter(isObject)
      .filter(o => o.name === name);
  return diffContracts({ schema: pick(before) }, { schema: pick(after) }).objects[0] ?? null;
}

/** Finds the newest version where the named object changed in a newest-first history. */
export function lastChange<T extends { data: any }>(versions: T[], name: string): T | null {
  for (let i = 0; i < versions.length; i++) {
    const older = versions[i + 1];
    const here = list(versions[i].data?.schema).find((o: any) => o?.name === name);
    if (!here) continue;
    if (!older) return versions[i];
    if (diffObject(older.data, versions[i].data, name)) return versions[i];
  }
  return null;
}
