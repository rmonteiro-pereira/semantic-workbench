/** Which kinds of entity a person hides in the Graph and Neighborhood views, remembered per model in this browser. */

/** Kinds that describe value shapes rather than business concepts. */
export const VALUE_KINDS = new Set(['ValueType', 'Built-in concept']);

const valuesKey = (modelName: string) => 'workbench:hide-value-types:' + modelName;
export const kpisKey = (modelName: string) => 'workbench:hide-kpis:' + modelName;

/** Reads a yes/no browser setting; storage that is blocked counts as off. */
export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Remembers a yes/no browser setting; an off setting removes its key. */
export function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {}
}

export function readHideValues(modelName?: string): boolean {
  return modelName ? readFlag(valuesKey(modelName)) : false;
}

export function writeHideValues(modelName: string | undefined, hide: boolean): void {
  if (modelName) writeFlag(valuesKey(modelName), hide);
}
