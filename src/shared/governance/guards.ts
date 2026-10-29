// Finds the governed parts of a document that a write changes: metric status, the body of an
// approved metric, ODCS classification, critical data elements, contract team and roles, and
// properties at or above the protected classification level. The server and the browser share
// it, so it holds only pure functions over document text and identities.
import { parseSource } from '../edit/yaml-patch';
import { withMetricAttributes } from '../metrics/metric-save';
import { extensionOf, semanticModelPaths, type Path } from '../edit/item-model';
import { deepEqual, isObject } from '../edit/source-text';

/** Classification levels from least to most sensitive; their index is the level number. */
export const LEVELS = ['public', 'internal', 'confidential', 'restricted'] as const;

/** One classification level. */
export type Level = (typeof LEVELS)[number];

/** Numeric value of a level for comparisons in policies. */
export const levelNumber = (level: Level) => LEVELS.indexOf(level);

/** What a guarded change touches, which decides the permission it needs. */
export type GuardKind = 'metric-status' | 'metric-body' | 'classification' | 'critical-data-element' | 'team' | 'roles' | 'protected-property';

/** One file a write would change, with its text before and after; null means absent. */
export type FileChange = {
  project: string;
  path: string;
  before: string | null;
  after: string | null;
  /**
   * The file as the last commit has it, when known. Its metric owners count for self-approval
   * too, so handing a metric to someone else in one save and approving it in the next is refused.
   */
  committed?: string | null;
};

/** How a workspace or project reads classification values. */
export type ClassificationSettings = { aliases: Record<string, Level>; protectedLevel: Level };

/** The metric a metric guard is about, with every owner value it had before or after. */
export type GuardedMetric = { name: string; status: string; owners: string[] };

/** A governed part of one file that a write changes. */
export type GuardedChange = {
  project: string;
  file: string;
  /** JSON pointer in the file after the write, or before it when the part was removed. */
  pointer: string;
  kind: GuardKind;
  /** The highest classification level the changed part had before or after the write. */
  level: Level;
  metric?: GuardedMetric;
  /** Where the metric sits after the write, when lowering it to proposed can replace a refusal. */
  demotable?: Path;
};

/** The file a guarded change belongs to. */
type Origin = Pick<GuardedChange, 'project' | 'file'>;

/** Tells whether the person may make one guarded change. */
export type GuardDecision = (change: GuardedChange) => boolean;

/** The files as they may be written, and the guarded changes refused or turned into proposals. */
export type GuardOutcome = {
  changes: FileChange[];
  refused: GuardedChange[];
  demoted: GuardedChange[];
};

/** Statuses only an approver may set. */
const APPROVAL_STATUSES = new Set(['approved', 'deprecated']);

const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const pointerOf = (path: Path) => path.map(key => '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1')).join('');

/**
 * The level a classification value stands for. Admin aliases come first, then the level names;
 * any other text, and a missing value, counts as internal.
 */
export function classificationLevel(value: unknown, aliases: Record<string, Level>): Level {
  if (value === undefined || value === null) return 'internal';
  const text = String(value).trim().toLowerCase();
  const alias = Object.entries(aliases).find(([name]) => name.toLowerCase() === text)?.[1];
  if (alias) return alias;
  return (LEVELS as readonly string[]).includes(text) ? (text as Level) : 'internal';
}

/** The parsed document, or null when the text is absent or not a YAML or JSON object. */
function parsed(source: string | null): any {
  if (source === null) return null;
  try {
    const value = parseSource(source).toJS({ maxAliasCount: 100 });
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** Workbench attributes of a metric, read with the item editor's extension reader. */
function attributes(metric: any): Record<string, any> {
  return extensionOf(metric)?.value ?? {};
}

function ownerOf(metric: any): string {
  const owner = attributes(metric).owner;
  return typeof owner === 'string' ? ownerKey(owner) : '';
}

/** An owner value as the policies compare it: trimmed and lower-cased. */
export function ownerKey(owner: string): string {
  return owner.trim().toLowerCase();
}

/**
 * Whether an owner value names one of the given identity values, in any letter case. Callers
 * deciding self-approval pass every value a person has, so a doubtful match refuses.
 */
export function ownerMatches(owner: string, person: { verifiedEmail?: string | null; username?: string }): boolean {
  const key = ownerKey(owner);
  if (!key) return false;
  const values = [person.verifiedEmail, person.username].filter(Boolean) as string[];
  return values.some(value => ownerKey(value) === key);
}

/** A metric as it is compared for the approved-metric rule: everything but its description. */
function comparable(metric: any) {
  const { description: _description, custom_extensions: extensions, ...rest } = metric;
  const values = list(extensions).map(entry => {
    const parsedEntry = extensionOf({ custom_extensions: [entry] });
    if (!parsedEntry) return entry;
    const { status: _status, ...data } = parsedEntry.value;
    return { ...entry, data };
  });
  return { ...rest, custom_extensions: values };
}

type Located = { path: Path; value: any };

/** Metrics keyed by their model and name, so reordering a list changes nothing. */
function metricsOf(document: any): Map<string, Located> {
  const found = new Map<string, Located>();
  if (!document) return found;
  for (const modelPath of semanticModelPaths(document)) {
    const model = modelPath.reduce((value: any, key) => value?.[key], document);
    const seen = new Map<string, number>();
    list(model?.metrics).forEach((metric, index) => {
      if (!isObject(metric) || typeof (metric as any).name !== 'string') return;
      const name = (metric as any).name;
      // A repeated name gets its own key, so one copy cannot hide changes to another.
      const repeat = (seen.get(name) ?? 0) + 1;
      seen.set(name, repeat);
      const suffix = repeat > 1 ? '#' + repeat : '';
      found.set(pointerOf(modelPath) + '#' + name + suffix, {
        path: [...modelPath, 'metrics', index],
        value: metric,
      });
    });
  }
  return found;
}

/** Every distinct owner value of the versions of one metric. */
function ownersOf(versions: (Located | undefined)[]): string[] {
  const owners = versions.flatMap(version => (version ? [ownerOf(version.value)] : []));
  return [...new Set(owners)].filter(Boolean);
}

function metricChanges(file: Origin, before: any, after: any, committed: any) {
  const changes: GuardedChange[] = [];
  const previous = metricsOf(before);
  const next = metricsOf(after);
  const recorded = metricsOf(committed);
  for (const [key, current] of next) {
    const old = previous.get(key);
    const status = String(attributes(current.value).status ?? '');
    const oldStatus = String(old ? (attributes(old.value).status ?? '') : '');
    const metric: GuardedMetric = {
      name: current.value.name,
      status,
      owners: ownersOf([current, old, recorded.get(key)]),
    };
    const base = { ...file, pointer: pointerOf(current.path), level: 'public' as Level, metric };
    if (APPROVAL_STATUSES.has(status) && status !== oldStatus) {
      changes.push({ ...base, kind: 'metric-status' });
    } else if (oldStatus === 'approved' && status === 'approved' && !deepEqual(comparable(old!.value), comparable(current.value))) {
      changes.push({ ...base, kind: 'metric-body', demotable: current.path });
    }
  }
  // Removing an approved metric is a change to it that no demotion can express.
  for (const [key, old] of previous) {
    if (next.has(key) || attributes(old.value).status !== 'approved') continue;
    changes.push({
      ...file,
      pointer: pointerOf(old.path),
      kind: 'metric-body',
      level: 'public',
      metric: {
        name: old.value.name,
        status: 'approved',
        owners: [ownerOf(old.value)].filter(Boolean),
      },
    });
  }
  return changes;
}

/** A schema object or property of a data contract, keyed by the names on its way from the root. */
type Element = { path: Path; value: any };

function elementsOf(document: any): Map<string, Element> {
  const found = new Map<string, Element>();
  const visit = (items: unknown, path: Path, parentKey: string) => {
    list(items).forEach((item, index) => {
      if (!isObject(item)) return;
      const value = item as any;
      const key = `${parentKey}/${typeof value.name === 'string' ? value.name : '#' + index}`;
      const itemPath = [...path, index];
      found.set(key, { path: itemPath, value });
      visit(value.properties, [...itemPath, 'properties'], key);
      if (isObject(value.items)) {
        found.set(key + '/[items]', { path: [...itemPath, 'items'], value: value.items });
        visit(value.items.properties, [...itemPath, 'items', 'properties'], key + '/[items]');
      }
    });
  };
  if (document?.kind === 'DataContract') visit(document.schema, ['schema'], '');
  return found;
}

function highestLevel(levels: Level[]): Level {
  return levels.reduce((high, level) => (levelNumber(level) > levelNumber(high) ? level : high), 'public' as Level);
}

/** Classification and critical-data-element changes of one schema element. */
function labelChanges(base: Omit<GuardedChange, 'kind'>, old: any, current: any) {
  const changes: GuardedChange[] = [];
  if (!current) return changes;
  if (!deepEqual(old?.classification, current.classification)) {
    changes.push({ ...base, kind: 'classification' });
  }
  if (!deepEqual(old?.criticalDataElement, current.criticalDataElement)) {
    changes.push({ ...base, kind: 'critical-data-element' });
  }
  return changes;
}

function schemaChanges(file: Origin, before: any, after: any, settings: ClassificationSettings) {
  const previous = elementsOf(before);
  const next = elementsOf(after);
  const protectedAt = levelNumber(settings.protectedLevel);
  const levelOf = (element: any) => classificationLevel(element.classification, settings.aliases);
  const changes: GuardedChange[] = [];
  // A property protected as a whole is named once, not again for each of its parts.
  const covered: string[] = [];
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    const old = previous.get(key)?.value;
    const current = next.get(key)?.value;
    const level = highestLevel([old, current].filter(Boolean).map(levelOf));
    const path = (next.get(key) ?? previous.get(key))!.path;
    const base = { ...file, pointer: pointerOf(path), level };
    changes.push(...labelChanges(base, old, current));
    // An existing property keeps the protection it had, so lowering its level is still guarded.
    const guardedLevel = old ? levelOf(old) : level;
    const inside = covered.some(parent => key.startsWith(parent + '/'));
    if (!inside && levelNumber(guardedLevel) >= protectedAt && !deepEqual(old, current)) {
      changes.push({ ...base, level: guardedLevel, kind: 'protected-property' });
      covered.push(key);
    }
  }
  return changes;
}

function contractChanges(file: Origin, before: any, after: any, settings: ClassificationSettings) {
  if (before?.kind !== 'DataContract' && after?.kind !== 'DataContract') return [];
  const changes: GuardedChange[] = [];
  for (const key of ['team', 'roles'] as const) {
    if (!deepEqual(before?.[key], after?.[key])) {
      changes.push({ ...file, pointer: '/' + key, kind: key, level: 'public' });
    }
  }
  return [...changes, ...schemaChanges(file, before, after, settings)];
}

/** Every governed part one file change touches, read with the shared document parsers. */
export function guardedChanges(change: FileChange, settings: ClassificationSettings): GuardedChange[] {
  if (change.before === change.after) return [];
  const before = parsed(change.before);
  const after = parsed(change.after);
  const file = { project: change.project, file: change.path };
  const committed = parsed(change.committed ?? null);
  return [...metricChanges(file, before, after, committed), ...contractChanges(file, before, after, settings)];
}

/** Sets an approved metric back to proposed through the item editor's attribute write. */
export function demoteMetric(source: string, filename: string, metricPath: Path): string {
  return withMetricAttributes(source, filename, metricPath, { status: 'proposed' });
}

/**
 * Decides every guarded change of a write. Changes the person may not make are refused, except
 * edits of an approved metric, which become proposals when demotion is allowed. The returned
 * changes carry the text to write.
 */
export function applyGuards(changes: FileChange[], settingsFor: (project: string) => ClassificationSettings, allowed: GuardDecision, options: { demote: boolean }): GuardOutcome {
  const refused: GuardedChange[] = [];
  const demoted: GuardedChange[] = [];
  for (const change of changes) {
    for (const guarded of guardedChanges(change, settingsFor(change.project))) {
      if (allowed(guarded)) continue;
      if (options.demote && guarded.demotable) demoted.push(guarded);
      else refused.push(guarded);
    }
  }
  if (refused.length || !demoted.length) return { changes, refused, demoted };
  const written = changes.map(change => {
    const own = demoted.filter(guarded => guarded.project === change.project && guarded.file === change.path);
    if (!own.length || change.after === null) return change;
    const after = own.reduce((text, guarded) => demoteMetric(text, change.path, guarded.demotable!), change.after);
    return { ...change, after };
  });
  return { changes: written, refused, demoted };
}

/**
 * Checks the guarded changes of a write for one person. It returns the files as they may be
 * written and throws when a change is refused. The workspace receives it from the request.
 */
export type ContentGuard = (changes: FileChange[], options?: GuardOptions) => GuardOutcome;

/** Writes that bring in text the person did not type; they never demote, and a refusal asks a
 * Steward to do them instead. */
export type GuardOperation = 'pull' | 'revert' | 'delete' | 'restore' | 'import' | 'move' | 'switch' | 'publish';

/** How a write applies the guards: saves demote approved metrics, other operations name
 * themselves so a refusal can say who may do them. */
/**
 * How a guarded write is judged: whether an edited approved metric is demoted, which operation
 * brings the text in, and the domain of the project the write creates, if any.
 */
export type GuardOptions = { demote?: boolean; operation?: GuardOperation; domain?: string };

/** A metric the server stored as proposed instead of approved, as a response names it. */
export type Demotion = { file: string; pointer: string; metric: string };

/** The metrics a guarded write stored as proposed, for the response that must say so. */
export function demotionsOf(outcome: GuardOutcome): Demotion[] {
  return outcome.demoted.map(change => ({
    file: change.file,
    pointer: change.pointer,
    metric: change.metric?.name ?? '',
  }));
}

/**
 * Applies the server's demotions to text typed while that save was in flight, so the next save
 * builds on the stored status instead of setting approved again. A metric the typed text no
 * longer has at that pointer under that name, or text that does not parse, is left as typed.
 */
export function applyDemotions(text: string, filename: string, demotions: Demotion[]): string {
  return demotions.reduce((current, demotion) => {
    const path = pathOf(demotion.pointer);
    const metric = parsedAt(current, path);
    if (metric?.name !== demotion.metric || attributes(metric).status !== 'approved') {
      return current;
    }
    return demoteMetric(current, filename, path);
  }, text);
}

/** The document path a JSON pointer names, with numeric segments as list indexes. */
function pathOf(pointer: string): Path {
  return pointer
    .split('/')
    .slice(1)
    .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map(segment => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

function parsedAt(source: string, path: Path): any {
  return path.reduce((value: any, key) => value?.[key], parsed(source));
}

/** A person the workspace has seen, with the identity values a metric owner can name. */
export type KnownPerson = {
  kind: string;
  name: string;
  access: string;
  verifiedEmail: string | null;
  username: string;
  usernameVerified?: boolean;
};

/**
 * The identity values the provider vouches for: the verified address, and the username only when
 * the provider assigns it. An owner naming anything else is unverified.
 */
function verifiedIdentity(person: KnownPerson) {
  return {
    verifiedEmail: person.verifiedEmail,
    username: person.usernameVerified ? person.username : undefined,
  };
}

/** One person a metric owner can name: the display name and the address or username to store. */
export type Person = { name: string; owner: string };

/** Tells whether an owner value names someone the workspace has seen, by address or username. */
export function ownerVerifier(people: KnownPerson[]): (owner: string) => boolean {
  return owner => people.some(person => ownerMatches(owner, verifiedIdentity(person)));
}

/** People with access, each with the value a metric's owner field should hold for them. */
export function ownerChoices(people: KnownPerson[]): Person[] {
  return people
    .filter(person => person.kind === 'person' && person.access === 'granted')
    .flatMap(person => {
      const identity = verifiedIdentity(person);
      const owner = identity.verifiedEmail ?? identity.username;
      return owner ? [{ name: person.name, owner }] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
