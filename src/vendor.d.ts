/** Provides browser asset and worker module declarations for TypeScript. */
/// <reference types="vite/client" />
declare module 'cytoscape-fcose' {
  const extension: any;
  export default extension;
}
declare module 'shacl-engine' {
  import type { Term } from 'n3';
  /** The parts of one validation result that this app reads. */
  export type ShaclEngineResult = {
    focusNode: { term: Term };
    shape: { ptr: { term: Term } };
    constraintComponent: Term;
    severity?: Term;
    message?: Term[];
    path?: { predicates?: Term[] }[];
    source?: Term[];
  };
  export class Validator {
    constructor(shapes: unknown, options: Record<string, unknown>);
    validate(input: { dataset: unknown }): Promise<{ conforms: boolean; results: ShaclEngineResult[] }>;
  }
}
declare module 'shacl-engine/sparql.js' {
  export const targetResolvers: unknown;
  export const validations: unknown;
}
