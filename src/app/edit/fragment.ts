/** Edits an item's own lines while preserving every byte outside it and unchanged values
 * inside it. */
import type { Issue } from '../../shared/validation/diagnostics';
import { applyPatches } from '../../shared/editor/patch';
import { parseSource, valuePatches, itemValue } from '../../shared/edit/yaml-patch';
import { dedent, itemSpan, reindent } from '../../shared/edit/source-text';
import { applyStatusRules, fieldValue, writeField, type FieldSpec, type ItemKind, type Path } from '../../shared/edit/item-model';
// The item editor's draft: the item's own lines, without their indentation, are edited on their
// own (as fields or as source) and put back into the file in place. Every byte outside the item
// stays as it was; inside it, only the changed values change.
/** Records an item's source range, indentation and fragment-local path. */
export type Fragment = {
  from: number;
  to: number;
  prefix: string;
  text: string;
  path: Path;
  line: number;
};
/** Extracts an item's source lines with their common indentation removed. */
export function openFragment(base: string, path: Path): Fragment {
  const node: any = parseSource(base).getIn(path, true);
  if (!node?.range) throw Error(`Nothing at /${path.join('/')}.`);
  const span = itemSpan(base, node.range[0], node.range[1]);
  const { text, prefix } = dedent(base.slice(span.from, span.to), span.prefix);
  return {
    from: span.from,
    to: span.to,
    prefix,
    text,
    path: /^-[ \t]/.test(text) ? [0] : [],
    line: base.slice(0, span.from).split(/\r\n|\r|\n/).length,
  };
}
/** Restores fragment indentation and preserves all bytes outside the item. */
export const splice = (base: string, f: Fragment, text: string) => base.slice(0, f.from) + reindent(text, f.prefix) + base.slice(f.to);

/** Parses exactly one item from a fragment or returns an explanation of failure. */
export function fragmentValue(fragment: Fragment, text: string): { value?: any; error?: string } {
  try {
    if (fragment.path.length) {
      const list = itemValue(text, []);
      if (!Array.isArray(list) || list.length !== 1) return { error: 'Keep this as one list entry; add other items with Add.' };
    }
    const value = itemValue(text, fragment.path);
    return value && typeof value === 'object' ? { value } : { error: 'The item must stay a mapping of keys and values.' };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
// Findings of the whole draft, on the fragment's lines; errors elsewhere stay document-level (they
// block Save too), warnings elsewhere are about the rest of the file and are left out.
/** Maps findings to fragment lines while retaining errors elsewhere that block Save. */
export function fragmentIssues(issues: Issue[], fragment: Fragment, text: string): Issue[] {
  const lines = text.split(/\r\n|\r|\n/).length;
  const inside = (i: Issue) => i.line !== undefined && i.line >= fragment.line && i.line < fragment.line + lines;
  return issues
    .filter(i => i.severity === 'error' || inside(i))
    .map(i => {
      if (i.line === undefined || i.line < fragment.line || i.line >= fragment.line + lines) {
        const { line, column, ...rest } = i;
        return {
          ...rest,
          message: i.line ? `Line ${i.line} (outside this item): ${i.message}` : i.message,
        };
      }
      return {
        ...i,
        line: i.line - fragment.line + 1,
        column: i.column !== undefined ? Math.max(1, i.column - fragment.prefix.length) : undefined,
      };
    });
}
/** What one form edit changes: the field, its new input, and the item as it was before the edit. */
export type FieldChange = { filename: string; kind: ItemKind; spec: FieldSpec; input: string | boolean; original: any };
/** Patches one form field and reapplies metric status rules when needed. */
// The item is rewritten through the patcher, so only that value changes.
export function setField(text: string, fragment: Fragment, change: FieldChange) {
  const { filename, kind, spec, input, original } = change;
  const current = fragmentValue(fragment, text);
  if (!current.value) return { text, reopened: false };
  let next = writeField(current.value, spec, fieldValue(spec, input));
  let reopened = false;
  if (kind === 'metric') {
    const rules = applyStatusRules(original, next);
    next = rules.item;
    reopened = rules.reopened;
  }
  return { text: applyPatches(text, valuePatches(text, fragment.path, next, filename)), reopened };
}
