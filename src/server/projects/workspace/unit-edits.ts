/** Checks structural findings and tracks concept moves across files in an atomic edit. */
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import type { DeclaredMigration } from '../../../shared/core/address-migration';
import { formatAddress } from '../../../shared/core/item-address';
import { inspectOntologyUnit, isStructuredEntity } from '../../../shared/core/model';
import { deepEqual } from '../../../shared/edit/source-text';
import { InputError } from '../../../shared/validation/diagnostics';
import { validateInput } from '../../../shared/validation/input';
import { readMarker } from '../../../shared/tessera/marker';
import { readUnitStructure, type OntologyUnit, type UnitDocument } from '../../../shared/tessera/unit-structure';
import { decode } from '../atomic';
import { PathError, projectFile } from '../paths';
import type { Reader } from '../reader';
import type { Place } from '../working-copies';

type Edit = { path: string; before: string | null; after: string };

function unitDocument(path: string, source: string | null): UnitDocument | undefined {
  if (source === null) return undefined;
  const parsed = validateInput(source, posix.basename(path)).model;
  if (!parsed || !('document' in parsed)) return undefined;
  const data = parsed.document;
  const marker = readMarker(data);
  if (marker.family === 'tessera' && marker.revision === 3 && Array.isArray(data.ontology)) return { path, data };
}

function readOtherUnits(place: Place, project: string, reader: Reader, changed: ReadonlySet<string>): UnitDocument[] {
  const documents: UnitDocument[] = [];
  for (const file of place.cache.files(project)) {
    if (file.docType !== 'Ossie ontology' || changed.has(file.path) || (reader.view && !reader.view.canRead(project, file.path))) continue;
    try {
      const document = unitDocument(file.path, decode(readFileSync(projectFile(place.layout, project, file.path))));
      if (document) documents.push(document);
    } catch (error) {
      if (error instanceof PathError || (error instanceof Error && 'code' in error && error.code === 'ENOENT')) continue;
      throw error;
    }
  }
  return documents;
}

function movedConcepts(project: string, before: OntologyUnit, after: OntologyUnit, changed: ReadonlySet<string>): DeclaredMigration[] {
  const oldItems = inspectOntologyUnit(before, project).entities.filter(isStructuredEntity);
  const nextItems = new Map(
    inspectOntologyUnit(after, project)
      .entities.filter(isStructuredEntity)
      .map(item => [item.name, item]),
  );
  const migrations: DeclaredMigration[] = [];
  for (const item of oldItems) {
    const from = item.address;
    const moved = nextItems.get(item.name);
    if (!moved || !deepEqual(item.definition, moved.definition)) continue;
    const to = moved.address;
    if (!from.document || !to.document || [...from.chain, ...to.chain].some(segment => 'position' in segment)) continue;
    const fromPath = from.document.join('/');
    const toPath = to.document.join('/');
    if (fromPath !== toPath && changed.has(fromPath) && changed.has(toPath)) migrations.push({ kind: 'item', from: formatAddress(from), to: formatAddress(to) });
  }
  return migrations;
}

/** Rejects duplicate concepts in a candidate unit and returns moves between edited files. */
export function unitEditMigrations(place: Place, project: string, reader: Reader, edits: readonly Edit[]): DeclaredMigration[] {
  const beforeEdits = edits.flatMap(edit => unitDocument(edit.path, edit.before) ?? []);
  const afterEdits = edits.flatMap(edit => unitDocument(edit.path, edit.after) ?? []);
  if (!beforeEdits.length && !afterEdits.length) return [];
  const changed = new Set(edits.map(edit => edit.path));
  const other = readOtherUnits(place, project, reader, changed);
  const after = readUnitStructure([...other, ...afterEdits]);
  const conflicts = after.findings.filter(finding => finding.code === 'tessera-duplicate-concept' && finding.files.some(file => changed.has(file)));
  if (conflicts.length) throw new InputError(conflicts);
  if (changed.size < 2) return [];
  const before = readUnitStructure([...other, ...beforeEdits]);
  const previous = new Map(before.units.map(unit => [unit.root.path, unit]));
  return after.units.flatMap(unit => {
    const original = previous.get(unit.root.path);
    if (!original || ![unit.root, ...unit.parts].some(file => changed.has(file.path))) return [];
    return movedConcepts(project, original, unit, changed);
  });
}
