// Findings for a Tessera document: the marker, the revision, the Ossie base, the registered properties, then the derived schema.
import { isObject } from '../edit/source-text';
import type { Issue } from '../validation/diagnostics';
import { schemaErrorPath } from '../validation/diagnostics';
import { compareText } from './canonical-json';
import { findBase, SUPPORTED_BASES, type SupportedBase } from './bases';
import { hasTesseraPrefix, SUPPORTED_REVISIONS, TesseraNames, type DocumentFormat } from './format';
import { readMarker, type MarkerReading } from './marker';
import { REGISTRY, type AdditionPlace, type Registry } from './registry';
import { additionSemanticIssues } from './semantic-checks';

/** What a Tessera check reads besides the document; tests replace these to try a later revision or base. */
export type TesseraOptions = {
  registry?: Registry;
  bases?: readonly SupportedBase[];
  revisions?: readonly number[];
};

/** The findings of a document and the format they were found for, or no format when the findings stop it from being assigned one. */
export type TesseraResult = { issues: Issue[]; format: DocumentFormat | null };

const PLACE_LABELS: Record<AdditionPlace, string> = {
  root: 'the ontology root',
  concept: 'a concept',
  relationship: 'a relationship of a concept',
};

const PROPERTY_CODES = new Set(['tessera-property', 'tessera-reserved', 'tessera-location']);

const MARKER_PATH = `/${TesseraNames.markerKey}`;

function error(code: string, path: string, message: string): Issue {
  return { severity: 'error', code, path, message };
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function describeValue(value: unknown): string {
  return typeof value === 'string' ? `the text "${value}"` : JSON.stringify(value);
}

/** Names the place an object sits in, from its path, or nothing when it is not a place that takes additions. */
function placeOf(segments: string[]): AdditionPlace | undefined {
  if (segments.length === 0) return 'root';
  if (segments.length === 2 && segments[0] === 'ontology') return 'concept';
  if (segments.length === 4 && segments[0] === 'ontology' && segments[2] === 'relationships') return 'relationship';
  return undefined;
}

type PropertySite = { pointer: string; name: string; place: AdditionPlace | undefined };

/** Finds every property under the Tessera prefix, at any depth except the prefix map where such names are ordinary data. */
function prefixedProperties(data: unknown): PropertySite[] {
  const sites: PropertySite[] = [];
  const pending: { value: unknown; segments: string[] }[] = [{ value: data, segments: [] }];
  while (pending.length) {
    const { value, segments } = pending.pop()!;
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        if (child !== null && typeof child === 'object') pending.push({ value: child, segments: [...segments, String(index)] });
      });
    } else if (isObject(value)) {
      for (const [name, child] of Object.entries(value)) {
        if (segments.length === 0 && name === 'prefixes') continue;
        if (hasTesseraPrefix(name)) sites.push({ pointer: '/' + [...segments, name].map(escapePointerSegment).join('/'), name, place: placeOf(segments) });
        // Text and numbers hold no properties, so only objects and lists are worth visiting.
        if (child !== null && typeof child === 'object') pending.push({ value: child, segments: [...segments, name] });
      }
    }
  }
  return sites.sort((first, second) => compareText(first.pointer, second.pointer));
}

/** Checks every prefixed property against the registry and the reserved names. */
function propertyIssues(data: unknown, registry: Registry, declaredRevision: number | undefined): Issue[] {
  const issues: Issue[] = [];
  for (const site of prefixedProperties(data)) {
    const entry = registry.byName(site.name);
    const owner = registry.reservedOwner(site.name);
    if (owner !== undefined) {
      issues.push(error('tessera-reserved', site.pointer, `${site.name} is reserved for a later ${TesseraNames.product} feature (${owner}) and is not available in the current revision.`));
    } else if (!entry) {
      const known = registry.additions.map(addition => addition.name).join(', ');
      issues.push(error('tessera-property', site.pointer, `${site.name} is not a ${TesseraNames.product} property. Registered properties: ${known}.`));
    } else if (declaredRevision !== undefined && entry.since > declaredRevision) {
      issues.push(error('tessera-revision', site.pointer, `${site.name} needs ${TesseraNames.product} revision ${entry.since} or higher, and this document declares revision ${declaredRevision}.`));
    } else if (!site.place || !entry.places.includes(site.place)) {
      const allowed = entry.places.map(place => PLACE_LABELS[place]).join(', ');
      issues.push(error('tessera-location', site.pointer, `${site.name} is not allowed here. It is allowed on: ${allowed}.`));
    }
  }
  return issues;
}

function markerIssue(reading: Extract<MarkerReading, { family: 'invalid' }>, revisions: readonly number[]): Issue {
  const message = `The ${TesseraNames.product} marker must be a whole number of at least 1, and this one is ${describeValue(reading.value)}. Supported revisions: ${revisions.join(', ')}.`;
  return error('tessera-marker', MARKER_PATH, message);
}

function derivedSchemaIssues(data: unknown, base: SupportedBase, revision: number, reported: Set<string>): Issue[] {
  const validate = base.validators[revision];
  if (validate(data)) return [];
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const failure of validate.errors ?? []) {
    const path = schemaErrorPath(failure) || '/';
    const message = failure.message ?? 'Schema violation.';
    const repeatsFinding = failure.keyword === 'additionalProperties' && reported.has(path);
    if (repeatsFinding || seen.has(`${path} ${message}`)) continue;
    seen.add(`${path} ${message}`);
    issues.push({ severity: 'error', code: 'schema', path, message });
  }
  return issues;
}

/** Drops schema findings that point at a property a Tessera finding already explains, so one mistake gives one finding. */
export function withoutRepeatedSchemaFindings(issues: Issue[]): Issue[] {
  const explained = new Set(issues.filter(issue => PROPERTY_CODES.has(issue.code)).map(issue => issue.path));
  return issues.filter(issue => issue.code !== 'schema' || !explained.has(issue.path));
}

/** Describes the format of a parsed document without validating it: standard, Tessera on a known base, or nothing when it cannot be placed. */
export function documentFormat(data: unknown, options: TesseraOptions = {}): DocumentFormat | null {
  const reading = readMarker(data);
  if (reading.family === 'standard') return { family: 'standard' };
  if (reading.family === 'invalid') return null;
  const document = data as Record<string, unknown>;
  const base = findBase(options.bases ?? SUPPORTED_BASES, document.version);
  const revisions = options.revisions ?? SUPPORTED_REVISIONS;
  if (document.ontology === undefined || !base || !revisions.includes(reading.revision) || !base.validators[reading.revision]) return null;
  return { family: 'tessera', revision: reading.revision, base: base.version, baseLabel: base.label };
}

/** Gives the findings for a document that carries the marker. A document without it gets none and the standard format. */
export function tesseraIssues(data: unknown, options: TesseraOptions = {}): TesseraResult {
  const registry = options.registry ?? REGISTRY;
  const bases = options.bases ?? SUPPORTED_BASES;
  const revisions = options.revisions ?? SUPPORTED_REVISIONS;
  const reading = readMarker(data);
  if (reading.family === 'standard') return { issues: [], format: { family: 'standard' } };
  const document = data as Record<string, unknown>;
  const issues: Issue[] = [];
  const declaredRevision = reading.family === 'tessera' ? reading.revision : undefined;
  if (reading.family === 'invalid') issues.push(markerIssue(reading, revisions));
  if (declaredRevision !== undefined && !revisions.includes(declaredRevision))
    issues.push(
      error(
        'tessera-revision',
        MARKER_PATH,
        `This document is ${TesseraNames.product} revision ${declaredRevision}, which this workbench does not support. Supported revisions: ${revisions.join(', ')}.`,
      ),
    );
  const isOntology = document.ontology !== undefined;
  if (!isOntology)
    issues.push(
      error(
        'tessera-kind',
        MARKER_PATH,
        `In ${TesseraNames.product} revision ${revisions.join(', ')} the marker is allowed on ontology documents only. Remove ${TesseraNames.markerKey} from this document.`,
      ),
    );
  const base = findBase(bases, document.version);
  if (declaredRevision !== undefined && isOntology && !base) {
    const supported = bases.map(candidate => candidate.version).join(', ');
    issues.push(error('tessera-base', '/version', `A ${TesseraNames.product} document must name a supported Ossie base in version. Supported: ${supported}.`));
  }
  const properties = propertyIssues(document, registry, declaredRevision);
  issues.push(...properties);
  const usable = declaredRevision !== undefined && revisions.includes(declaredRevision) && isOntology && base;
  if (!usable) return { issues, format: null };
  if (!base.validators[declaredRevision]) {
    issues.push(error('tessera-base', '/version', `Ossie ${base.version} has no schema for ${TesseraNames.product} revision ${declaredRevision}.`));
    return { issues, format: null };
  }
  issues.push(...derivedSchemaIssues(document, base, declaredRevision, new Set(properties.map(issue => issue.path))));
  issues.push(...additionSemanticIssues(document, declaredRevision));
  return { issues, format: documentFormat(data, options) };
}
