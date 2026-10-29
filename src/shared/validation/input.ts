/** Validates a document's input envelope before inspecting its contents. */
import { inspect } from '../core/model';
import { InputError, type Issue } from './diagnostics';
/** Validates the input envelope, then inspects the document and returns findings. */
export function validateInput(source: string, filename = 'definition.yaml') {
  try {
    const model = inspect(source, filename);
    return { valid: true as const, model, issues: model.issues ?? ([] as Issue[]) };
  } catch (error) {
    const issues: Issue[] = error instanceof InputError ? error.issues : [{ severity: 'error', code: 'syntax', path: '/', message: (error as Error).message }];
    return { valid: false as const, model: null, issues };
  }
}
