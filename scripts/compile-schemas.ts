// Generates browser validators without runtime code compilation under the content security policy.
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';
import standaloneCode from 'ajv/dist/standalone';
import { _ } from 'ajv/dist/compile/codegen';
import addFormats from 'ajv-formats';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import odcs from '../schemas/odcs-v3.1.0.json';
import ossie from '../schemas/ossie-0.2.0.dev0.json';
import ontology from '../schemas/ossie-ontology-0.2.0.dev0.json';
import mapping from '../schemas/ossie-mapping-0.2.0.dev0.json';
import metric from '../schemas/semantic-workbench-metric-v1.json';
import bindings from '../schemas/semantic-workbench-mapping-v1.json';

const options = {
  strict: false,
  allErrors: true,
  code: { source: true, esm: true, formats: _`formats` },
};
const contracts = new Ajv2019(options);
const semantics = new Ajv2020(options);
const mappings = new Ajv2020(options);
const extensions = new Ajv2020(options);
for (const validator of [contracts, semantics, mappings]) addFormats(validator);
mappings.addFormat('iri', /^[a-z][a-z\d+.-]*:[^\s]+$/i);
const ontologyId = 'https://raw.githubusercontent.com/apache/ossie/main/ontology/ontology.json';
mappings.addSchema(
  ossie,
  'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json',
);
mappings.addSchema(ontology, ontologyId);
const validators = [
  ['contract', contracts, contracts.compile(odcs)],
  ['semantic', semantics, semantics.compile(ossie)],
  ['mapping', mappings, mappings.compile(mapping)],
  ['embedded-mapping', mappings, mappings.compile({ $ref: `${ontologyId}#/$defs/OntologyMap` })],
  ['ontology', mappings, mappings.getSchema(ontologyId)!],
  ['metric', extensions, extensions.compile(metric)],
  ['mapping-extension', extensions, extensions.compile(bindings)],
] as const;

/** Writes deterministic standalone modules and their TypeScript declarations. */
export function compileSchemas(destination = 'src/generated/schema-validators') {
  mkdirSync(destination, { recursive: true });
  for (const [name, compiler, validate] of validators) {
    const imports = ["import { fullFormats as formats } from 'ajv-formats/dist/formats.js';"];
    const code = standaloneCode(compiler, validate).replace(
      /require\("([^"]+)"\)/g,
      (_match, module: string) => {
        const binding = `runtime${imports.length}`;
        imports.push(`import * as ${binding}Module from '${module}.js';`);
        // Bundlers expose a CommonJS module either as its exports or under `default`; take the
        // exports object in both cases so `.default` and named members resolve the same way.
        imports.push(
          `const ${binding} = ${binding}Module.default?.__esModule ? ${binding}Module.default : ${binding}Module;`,
        );
        return binding;
      },
    );
    writeFileSync(
      join(destination, `${name}.js`),
      `// generated, do not edit\n${imports.join('\n')}\n${code}\n`,
    );
    writeFileSync(
      join(destination, `${name}.d.ts`),
      '// generated, do not edit\n' +
        "import type { ValidateFunction } from 'ajv';\n" +
        'declare const validate: ValidateFunction;\nexport default validate;\n',
    );
  }
}

if (import.meta.main) compileSchemas();
