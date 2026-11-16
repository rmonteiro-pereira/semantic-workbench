/** Resolves structured items only after the caller's project and path visibility checks. */
import { inspect } from '../../shared/core/model';
import { resolveInModel, type AddressedItem } from '../../shared/core/model-addresses';
import type { Address } from '../../shared/core/item-address';
import { InputError } from '../../shared/validation/diagnostics';
import { NotFoundError } from './errors';
import { assertSlug, projectPath, PathError } from './paths';
import type { Reader } from './reader';

/** Supplies existing workspace reads without widening their caller boundary. */
export type AddressReadContext = {
  projectExists: (project: string) => boolean;
  readFile: (project: string, path: string, reader: Reader) => { source: string };
};
/** Returns source text only for a unique item the caller can already read. */
export type CurrentItemResolution = { status: 'found'; item: AddressedItem; source: string } | { status: 'ambiguous'; items: AddressedItem[] } | { status: 'missing' };

/** Reads no project data for an unreadable project or file and makes hidden equal missing. */
export function resolveCurrentItem(context: AddressReadContext, address: Address, reader: Reader): CurrentItemResolution {
  if (address.form !== 'absolute' || !address.project || !address.document || !address.chain.length) return { status: 'missing' };
  const project = address.project;
  const path = address.document.join('/');
  if (reader.view && (!reader.view.readableProjects.has(project) || !reader.view.canRead(project, path))) return { status: 'missing' };
  try {
    assertSlug(project);
    projectPath(path);
    if (!context.projectExists(project)) return { status: 'missing' };
    const document = context.readFile(project, path, reader);
    const model = inspect(document.source, path);
    if (!('document' in model)) return { status: 'missing' };
    const result = resolveInModel(model.document, address, { project, document: address.document });
    return result.status === 'found' ? { ...result, source: document.source } : result;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof InputError || error instanceof PathError) return { status: 'missing' };
    throw error;
  }
}
