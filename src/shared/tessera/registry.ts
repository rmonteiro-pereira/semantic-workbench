// The one list of Tessera additions. Validation, the derived schema, the compiler and the loss report all read it.
//
// To add a property in a later revision:
// 1. Write one module under additions/ that exports one entry.
// 2. Add the entry to ADDITIONS below.
// 3. Remove its name from reserved-names.ts.
// 4. Give it a revision number above the highest one used so far.
// 5. Choose what the compiler does with it: drop, translate or refuse.
// 6. Regenerate the derived schemas with scripts/derive-tessera-schema.ts.
// 7. Add fixture documents under tests/fixtures/tessera/additions/<name>/.
// 8. Add a mutant for the new decision in scripts/tessera-mutants.ts.
// The marker reader, the validator and the loss report need no change.
import { hasTesseraPrefix, TesseraNames } from './format';
import { NOTES_ADDITION } from './additions/notes';
import { RESERVED_NAMES, type ReservedName } from './reserved-names';

/** Where in an ontology document an addition may appear. */
export type AdditionPlace = 'root' | 'concept' | 'relationship';

/** What the compiler does with an addition: remove it and report the loss, rewrite it as standard Ossie, or refuse the compile. */
export type Disposition = 'drop' | 'translate' | 'refuse';

/** One property Tessera adds to Ossie. */
export type AdditionEntry = {
  name: string;
  since: number;
  places: AdditionPlace[];
  value: { description: string; schema: Record<string, unknown> };
  disposition: Disposition;
  owner: string;
};

/** The lookups every consumer of the registry uses. */
export type Registry = {
  additions: readonly AdditionEntry[];
  reservedNames: readonly ReservedName[];
  byName(name: string): AdditionEntry | undefined;
  atPlace(place: AdditionPlace): AdditionEntry[];
  reservedOwner(name: string): string | undefined;
};

/** Every addition of every revision. */
export const ADDITIONS: readonly AdditionEntry[] = [NOTES_ADDITION];

/** Lists the mistakes in a list of additions: a repeated name, a missing prefix, a name that is also reserved or the marker key itself. */
export function registryProblems(additions: readonly AdditionEntry[], reservedNames: readonly ReservedName[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const reserved = new Set(reservedNames.map(entry => entry.name));
  for (const addition of additions) {
    if (seen.has(addition.name)) problems.push(`The addition ${addition.name} is registered twice.`);
    seen.add(addition.name);
    if (!hasTesseraPrefix(addition.name)) problems.push(`The addition ${addition.name} does not start with ${TesseraNames.propertyPrefix}.`);
    if (reserved.has(addition.name)) problems.push(`The addition ${addition.name} is also a reserved name.`);
  }
  return problems;
}

/** Builds a registry and throws when its list has a mistake, so a bad entry fails when the module loads. */
export function createRegistry(additions: readonly AdditionEntry[], reservedNames: readonly ReservedName[]): Registry {
  const problems = registryProblems(additions, reservedNames);
  if (problems.length) throw new Error(`The Tessera registry is invalid: ${problems.join(' ')}`);
  const byName = new Map(additions.map(addition => [addition.name, addition]));
  const reservedOwners = new Map(reservedNames.map(entry => [entry.name, entry.owner]));
  return {
    additions,
    reservedNames,
    byName: name => byName.get(name),
    atPlace: place => additions.filter(addition => addition.places.includes(place)),
    reservedOwner: name => reservedOwners.get(name),
  };
}

/** The registry the workbench uses. */
export const REGISTRY: Registry = createRegistry(ADDITIONS, RESERVED_NAMES);
