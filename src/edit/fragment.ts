import type { Issue } from '../diagnostics';
import { applyPatches } from '../editor/patch';
import { parseSource, valuePatches, itemValue } from './yaml-patch';
import { dedent, itemSpan, reindent } from './source-text';
import {
  applyStatusRules,
  fieldValue,
  writeField,
  type FieldSpec,
  type ItemKind,
  type Path,
} from './item-model';
// The item editor's draft (FR-048, FR-053): the item's own lines, without their indentation, are
// edited on their own (as fields or as source) and put back into the file in place. Every byte
// outside the item stays as it was; inside it, only the changed values change.
export type Fragment = {
  from: number;
  to: number;
  prefix: string;
  text: string;
  path: Path;
  line: number;
};
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
export const splice = (base: string, f: Fragment, text: string) =>
  base.slice(0, f.from) + reindent(text, f.prefix) + base.slice(f.to);
// The item value of an edited fragment, or why it is not one item any more.
export function fragmentValue(f: Fragment, text: string): { value?: any; error?: string } {
  try {
    if (f.path.length) {
      const list = itemValue(text, []);
      if (!Array.isArray(list) || list.length !== 1)
        return { error: 'Keep this as one list entry; add other items with Add.' };
    }
    const value = itemValue(text, f.path);
    return value && typeof value === 'object'
      ? { value }
      : { error: 'The item must stay a mapping of keys and values.' };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
// Findings of the whole draft, on the fragment's lines; errors elsewhere stay document-level (they
// block Save too), warnings elsewhere are about the rest of the file and are left out.
export function fragmentIssues(issues: Issue[], f: Fragment, text: string): Issue[] {
  const lines = text.split(/\r\n|\r|\n/).length;
  const inside = (i: Issue) => i.line !== undefined && i.line >= f.line && i.line < f.line + lines;
  return issues
    .filter(i => i.severity === 'error' || inside(i))
    .map(i => {
      if (i.line === undefined || i.line < f.line || i.line >= f.line + lines) {
        const { line, column, ...rest } = i;
        return {
          ...rest,
          message: i.line ? `Line ${i.line} (outside this item): ${i.message}` : i.message,
        };
      }
      return {
        ...i,
        line: i.line - f.line + 1,
        column: i.column !== undefined ? Math.max(1, i.column - f.prefix.length) : undefined,
      };
    });
}
// One form field changed: the item is rewritten through the patcher, so only that value changes.
export function setField(
  text: string,
  f: Fragment,
  filename: string,
  kind: ItemKind,
  spec: FieldSpec,
  input: string | boolean,
  original: any,
) {
  const current = fragmentValue(f, text);
  if (!current.value) return { text, reopened: false };
  let next = writeField(current.value, spec, fieldValue(spec, input));
  let reopened = false;
  if (kind === 'metric') {
    const r = applyStatusRules(original, next);
    next = r.item;
    reopened = r.reopened;
  }
  return { text: applyPatches(text, valuePatches(text, f.path, next, filename)), reopened };
}
