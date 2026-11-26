// The scope vocabulary of an agent connection: what each scope allows, what the consent page says about it, and which operation effects it carries.
import type { OperationEffect } from '../auth/operation-inventory';
import { SCOPE_WORDING as SHARED_SCOPE_WORDING } from '../../shared/connections/scope-wording';

/** Every scope name. `administration` is reserved and is never offered or accepted. */
export const SCOPES = ['read', 'validate', 'edit', 'commit', 'remote', 'publish', 'administration'] as const;
export type Scope = (typeof SCOPES)[number];

/** The scopes a program may be registered for and a person may choose. */
export type OfferedScope = Exclude<Scope, 'administration'>;

/** Pre-selected on the consent page. */
export const DEFAULT_SCOPES: readonly OfferedScope[] = ['read', 'validate', 'edit', 'commit'];

/**
 * The operation effects each scope carries. Validation writes nothing, so it maps to the read
 * effect. No scope maps to `destroy`, so irreversible operations are out of reach of any connection.
 */
export const SCOPE_EFFECTS: Readonly<Record<Scope, readonly OperationEffect[]>> = {
  read: ['read'],
  validate: ['read'],
  edit: ['localWrite'],
  commit: ['commit'],
  remote: ['remote', 'credential'],
  publish: ['publish'],
  administration: ['administration'],
};

/** What the consent page says each scope allows, in plain words. The wording lives in the shared
 * layer so the Admin page can show it too; this typed view fails to compile if a scope lacks it. */
export const SCOPE_WORDING: Readonly<Record<OfferedScope, { label: string; allows: string }>> = SHARED_SCOPE_WORDING;

/** The scopes people can choose, in the order the page shows them. */
export function offeredScopes(): OfferedScope[] {
  return SCOPES.filter((scope): scope is OfferedScope => scope !== 'administration');
}

/** Whether a name is a scope a person may choose. */
export function isOfferedScope(name: string): name is OfferedScope {
  return (offeredScopes() as string[]).includes(name);
}

/** Sorted, duplicate-free list, the stored form of a scope set. */
export function normalizeScopes(scopes: readonly Scope[]): Scope[] {
  return SCOPES.filter(scope => scopes.includes(scope));
}

/** The effects a scope set carries, without duplicates. */
export function effectsOf(scopes: readonly Scope[]): OperationEffect[] {
  const effects = new Set<OperationEffect>();
  for (const scope of scopes) for (const effect of SCOPE_EFFECTS[scope]) effects.add(effect);
  return [...effects];
}

export type ScopeParse = { ok: true; scopes: OfferedScope[] } | { ok: false; reason: 'unknown-scope' };

/** Reads a space separated scope parameter. An unknown name, including the reserved one, refuses the request. */
export function parseScopeParameter(text: string | null | undefined): ScopeParse {
  const names = (text ?? '').split(' ').filter(name => name !== '');
  const scopes: OfferedScope[] = [];
  for (const name of names) {
    if (!isOfferedScope(name)) return { ok: false, reason: 'unknown-scope' };
    if (!scopes.includes(name)) scopes.push(name);
  }
  return { ok: true, scopes: normalizeScopes(scopes) as OfferedScope[] };
}
