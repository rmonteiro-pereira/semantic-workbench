// Parses comparison side names without resolving files or Git references.
/** A validated side name and its optional reference. */
export type DiffSide = { name: string; reference?: string; text: string };
/** A side parser refuses malformed references before any data access. */
export type SideDefinition = { name: string; named: boolean; accepts: (reference: string) => boolean };
/** Built-in side names shown when a request is refused. */
export const SIDE_NAMES = ['published', 'working', 'branch:<name>', 'commit:<id>'] as const;

function invalidBranchCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 32 || code === 127 || '~^:?*[\\'.includes(character);
}

const branchName = (value: string) =>
  value.length > 0 &&
  value.length <= 200 &&
  !value.startsWith('-') &&
  !value.endsWith('.') &&
  !value.includes('..') &&
  !value.includes('@{') &&
  value !== '@' &&
  !Array.from(value).some(invalidBranchCharacter) &&
  value.split('/').every(part => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'));

/** Creates an isolated registry so extra sides do not change other consumers. */
export function createSideRegistry() {
  const definitions: SideDefinition[] = [
    { name: 'published', named: false, accepts: value => value === '' },
    { name: 'working', named: false, accepts: value => value === '' },
    { name: 'branch', named: true, accepts: branchName },
    { name: 'commit', named: true, accepts: value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value) },
  ];
  function register(definition: SideDefinition) {
    if (!/^[a-z][a-z-]*$/.test(definition.name) || definitions.some(known => known.name === definition.name)) throw new Error('Side name is invalid or already registered.');
    definitions.push(definition);
  }
  function parse(text: string): DiffSide {
    const separator = text.indexOf(':');
    const name = separator < 0 ? text : text.slice(0, separator);
    const reference = separator < 0 ? '' : text.slice(separator + 1);
    const definition = definitions.find(candidate => candidate.name === name);
    if (!definition || definition.named !== separator >= 0 || !definition.accepts(reference)) {
      const names = definitions.map(side => side.name + (side.named ? ':<reference>' : ''));
      throw new Error(`Invalid comparison side. Supported sides: ${names.join(', ')}.`);
    }
    return { name, text, ...(definition.named ? { reference } : {}) };
  }
  return { register, parse };
}

/** Parses one built-in side, refusing unknown names and invalid full references. */
export const parseSide = createSideRegistry().parse;
