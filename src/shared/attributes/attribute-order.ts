// The display order of a concept's attributes. The order list only places names; it never defines an attribute.
import { ATTRIBUTE_ORDER_PROPERTY, MAX_ATTRIBUTE_ORDER_ENTRIES } from '../tessera/additions/attributes';
import type { AttributeEntry } from './attribute-rule';

/** Reads the order list of a concept as text entries, or an empty list when there is none. */
export function orderListOf(concept: Record<string, unknown>): string[] {
  const list = concept[ATTRIBUTE_ORDER_PROPERTY];
  return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Puts the listed attributes first in list order and every other attribute after them in file order. Inherited entries keep their place at the end. */
export function orderedAttributes(attributes: readonly AttributeEntry[], order: readonly string[]): AttributeEntry[] {
  const own = attributes.filter(attribute => !attribute.inheritedFrom);
  const inherited = attributes.filter(attribute => attribute.inheritedFrom);
  const listed: AttributeEntry[] = [];
  for (const name of order) {
    const match = own.find(attribute => attribute.name === name);
    if (match && !listed.includes(match)) listed.push(match);
  }
  return [...listed, ...own.filter(attribute => !listed.includes(attribute)), ...inherited];
}

/** The order list after an attribute is added: an existing list gains the name at its end, and a concept without a list stays without one. */
export function orderAfterAdd(order: readonly string[] | undefined, name: string): string[] | undefined {
  if (!order) return undefined;
  if (order.includes(name)) return [...order];
  return [...order, name].slice(0, MAX_ATTRIBUTE_ORDER_ENTRIES);
}

/** The order list after an attribute is renamed: the entry changes in place. */
export function orderAfterRename(order: readonly string[] | undefined, oldName: string, newName: string): string[] | undefined {
  if (!order) return undefined;
  return order.map(entry => (entry === oldName ? newName : entry));
}

/** The order list after an attribute is removed, or nothing when the list becomes empty so the property can be removed. */
export function orderAfterRemove(order: readonly string[] | undefined, name: string): string[] | undefined {
  if (!order) return undefined;
  const remaining = order.filter(entry => entry !== name);
  return remaining.length ? remaining : undefined;
}

/** The full order after moving one attribute up or down in the shown order. Every shown own attribute is written so the result is explicit. */
export function orderAfterMove(shownNames: readonly string[], name: string, direction: 'up' | 'down'): string[] {
  const position = shownNames.indexOf(name);
  const target = direction === 'up' ? position - 1 : position + 1;
  if (position < 0 || target < 0 || target >= shownNames.length) return [...shownNames];
  const moved = [...shownNames];
  [moved[position], moved[target]] = [moved[target], moved[position]];
  return moved;
}
