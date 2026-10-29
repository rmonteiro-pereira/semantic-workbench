/** Validates a document's input envelope before inspecting its contents. */
import { inspect } from '../core/model';
import { InputError, type Issue } from './diagnostics';
import type { ValidationOptions } from './validation';
/** Validates the input envelope, then inspects the document and returns findings. */
export function validateInput(source: string, filename = 'definition.yaml', options: ValidationOptions = {}) {
  try {
    const model = inspect(source, filename, options);
    return { valid: true as const, model, issues: model.issues ?? ([] as Issue[]) };
  } catch (error) {
    const issues: Issue[] = error instanceof InputError ? error.issues : [{ severity: 'error', code: 'syntax', path: '/', message: (error as Error).message }];
    return { valid: false as const, model: null, issues };
  }
}
