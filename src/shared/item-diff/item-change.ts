// Defines comparison inputs and the bounded browser response independently of transport.
/** One changed field with readable, bounded values. */
export type FieldChange = { field: string; before: string; after: string };
/** The unpublished state displayed on an item. */
export type ChangeState = 'added' | 'removed' | 'changed';
/** One addressed change, including explicit moves and duplicate-address counts. */
export type ItemChange = {
  kind: string;
  state: ChangeState;
  address: string;
  previousAddress?: string;
  name: string;
  ambiguous: number;
  fields: FieldChange[];
};
/** A side identity captured by the comparison request. */
export type SideVersion = { side: string; version: string };
/** A readable file whose items could not be compared. */
export type NotCompared = { path: string; side: 'from' | 'to'; reason: string };
/** The browser-only comparison answer; counts include omitted changes. */
export type ItemDiff = {
  from: SideVersion;
  to: SideVersion;
  counts: Record<ChangeState, number>;
  changes: ItemChange[];
  notCompared: NotCompared[];
  omitted: number;
};
/** A parsed item supplied by the owning document reader. */
export type DiffItem = { address: string; path: string; kind: string; name: string; data: Record<string, unknown> };
