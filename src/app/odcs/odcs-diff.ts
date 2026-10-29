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
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Serializes values with sorted keys so key order does not count as a change. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (isObject(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(k => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'undefined';
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
// The attribute-level differences of two mappings, leaving out the keys handled elsewhere.
function attributeChanges(before: Record<string, any>, after: Record<string, any>, skip: string[]): AttributeChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => !skip.includes(k)).sort();
  return keys.filter(k => !same(before[k], after[k])).map(k => ({ attribute: k, before: before[k], after: after[k] }));
}
const keyOf = (x: any, useId: boolean) => (useId && typeof x?.id === 'string' ? 'id:' + x.id : 'name:' + String(x?.name));
function matchBy(before: any[], after: any[]) {
  const useId = [...before, ...after].every(x => typeof x?.id === 'string');
  return { useId, key: (x: any) => keyOf(x, useId) };
}

/** Flattens nested properties into paths with their own non-child attributes. */
export function flattenProperties(props: unknown, prefix = ''): { path: string; property: Record<string, any> }[] {
  return list(props)
    .filter(isObject)
    .flatMap(property => {
      const path = prefix + String(property.name ?? '?');
      const nested = [
        ...flattenProperties(property.properties, path + '.'),
        ...(isObject(property.items) ? [{ path: path + '[]', property: property.items }, ...flattenProperties(property.items.properties, path + '[].')] : []),
      ];
      return [{ path, property }, ...nested];
    });
}
const CHILDREN = ['properties', 'items'];
function propertyDiff(beforeProps: unknown, afterProps: unknown): PropertyChange[] {
  const before = flattenProperties(beforeProps);
  const after = flattenProperties(afterProps);
  const ids = before.every(x => typeof x.property.id === 'string') && after.every(x => typeof x.property.id === 'string');
  const propertyKey = (x: { path: string; property: any }) => (ids ? 'id:' + x.property.id : x.path);
  const old = new Map(before.map(x => [propertyKey(x), x]));
  const now = new Map(after.map(x => [propertyKey(x), x]));
  const out: PropertyChange[] = [];
  for (const x of before) if (!now.has(propertyKey(x))) out.push({ path: x.path, kind: 'removed', changes: [] });
  for (const x of after) {
    const previous = old.get(propertyKey(x));
    if (!previous) {
      out.push({ path: x.path, kind: 'added', changes: [] });
      continue;
    }
    const changes = attributeChanges(previous.property, x.property, CHILDREN);
    if (previous.path !== x.path) changes.unshift({ attribute: 'path', before: previous.path, after: x.path });
    if (changes.length) out.push({ path: x.path, kind: 'changed', changes });
  }
  return out;
}
/** Compares all contract and object attributes across two versions. */
export function diffContracts(before: any, after: any): ContractDiff {
  const beforeContract = isObject(before) ? before : {};
  const afterContract = isObject(after) ? after : {};
  const objsA = list(beforeContract.schema).filter(isObject);
  const objsB = list(afterContract.schema).filter(isObject);
  const matcher = matchBy(objsA, objsB);
  const old = new Map(objsA.map(o => [matcher.key(o), o]));
  const now = new Map(objsB.map(o => [matcher.key(o), o]));
  const objects: ObjectDiff[] = [];
  for (const schemaObject of objsA)
    if (!now.has(matcher.key(schemaObject)))
      objects.push({
        object: String(schemaObject.name),
        kind: 'removed',
        attributes: [],
        properties: flattenProperties(schemaObject.properties).map(removed => ({
          path: removed.path,
          kind: 'removed',
          changes: [],
        })),
      });
  for (const schemaObject of objsB) {
    const previous = old.get(matcher.key(schemaObject));
    if (!previous) {
      objects.push({
        object: String(schemaObject.name),
        kind: 'added',
        attributes: [],
        properties: flattenProperties(schemaObject.properties).map(x => ({
          path: x.path,
          kind: 'added',
          changes: [],
        })),
      });
      continue;
    }
    const attributes = attributeChanges(previous, schemaObject, ['properties']);
    const properties = propertyDiff(previous.properties, schemaObject.properties);
    if (attributes.length || properties.length) objects.push({ object: String(schemaObject.name), kind: 'changed', attributes, properties });
  }
  return { contract: attributeChanges(beforeContract, afterContract, ['schema']), objects };
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
