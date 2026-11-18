/** Builds the active graph using only documents returned to the current reader. */
import { inspectOntologyUnit } from '../../shared/core/model';
import { isObject } from '../../shared/edit/source-text';
import { INCLUDES_PROPERTY } from '../../shared/tessera/additions/includes';
import { PART_PROPERTY } from '../../shared/tessera/additions/part';
import { completeOntologyUnit } from '../../shared/tessera/unit-structure';
import type { PartSelection } from '../mesh/PartPicker';
import type { Doc } from '../projects/api';
import type { ValidatedModel } from './types';
import { parsedDoc } from './parsedDocument';

function parsedDefinition(model: ValidatedModel | null): unknown {
  return model && 'document' in model ? model.document : undefined;
}

/** Returns a composed graph when the visible set contains the active root and every declared part. */
export function activeOntologyUnit(current: Doc | null, model: ValidatedModel | null, documents: readonly Doc[]) {
  const active = parsedDefinition(model);
  if (!current || !isObject(active) || (!active[PART_PROPERTY] && !active[INCLUDES_PROPERTY]?.length)) return null;
  const projectFiles = documents.filter(file => file.project === current.project && file.id !== current.id);
  const files = [{ path: current.path, data: active }, ...projectFiles.map(file => ({ path: file.path, data: parsedDefinition(parsedDoc(file).model) }))];
  const unit = completeOntologyUnit(files, current.path);
  if (!unit) return null;
  return { ...inspectOntologyUnit(unit, current.project), unitFiles: [unit.root, ...unit.parts].map(file => file.path) };
}

/** Describes a unit role without disclosing unavailable files. */
export function ontologyPartSelection(current: Doc | null, model: ValidatedModel, files: readonly string[] = []): PartSelection | undefined {
  if (!current) return undefined;
  const data = parsedDefinition(model);
  const part = isObject(data) && data[PART_PROPERTY] === true;
  if (!part && !files.length) return undefined;
  return { active: current.path, files, part: files.length ? files[0] !== current.path : part };
}
