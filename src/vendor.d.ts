/** Provides browser asset and worker module declarations for TypeScript. */
/// <reference types="vite/client" />
declare module 'cytoscape-fcose' {
  const extension: any;
  export default extension;
}
declare module 'shacl-engine' {
  export class Validator {
    constructor(shapes: unknown, options: Record<string, unknown>);
    validate(input: { dataset: unknown }): Promise<{ conforms: boolean; results: unknown[] }>;
  }
}
declare module 'shacl-engine/sparql.js' {
  export const targetResolvers: unknown;
  export const validations: unknown;
}
