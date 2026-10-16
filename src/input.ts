import { inspect } from './model';
import { InputError, type Issue } from './diagnostics';
export function validateInput(source: string, filename = 'definition.yaml') {
  try {
    const model = inspect(source, filename);
    return { valid: true as const, model, issues: model.issues ?? [] as Issue[] };
  } catch (e) {
    const issues: Issue[] = e instanceof InputError ? e.issues : [{severity:'error',code:'syntax',path:'/',message:(e as Error).message}];
    return {valid:false as const, model:null, issues};
  }
}
