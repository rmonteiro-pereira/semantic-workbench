// Generates browser validators without runtime code compilation under the content security policy.
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';
import standaloneCode from 'ajv/dist/standalone';
import { _ } from 'ajv/dist/compile/codegen';
import addFormats from 'ajv-formats';
import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
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
const mappingRef = 'urn:semantic-workbench:mapping';
const embeddedMappingRef = 'urn:semantic-workbench:embedded-mapping';
const metricRef = 'urn:semantic-workbench:metric';
const mappingExtensionRef = 'urn:semantic-workbench:mapping-extension';
mappings.addSchema(mapping, mappingRef);
mappings.addSchema({ $ref: `${ontologyId}#/$defs/OntologyMap` }, embeddedMappingRef);
extensions.addSchema(metric, metricRef);
extensions.addSchema(bindings, mappingExtensionRef);
const outputs = [
  { name: 'contract', compiler: contracts, validator: contracts.compile(odcs) },
  { name: 'semantic', compiler: semantics, validator: semantics.compile(ossie) },
  {
    name: 'mappings',
    compiler: mappings,
    validators: {
      standalone: mappingRef,
      embedded: embeddedMappingRef,
      ontology: ontologyId,
    },
  },
  {
    name: 'extensions',
    compiler: extensions,
    validators: { metric: metricRef, mapping: mappingExtensionRef },
  },
] as const;
const oldOutputs = [
  'contract',
  'semantic',
  'embedded-mapping',
  'extensions',
  'mapping-extension',
  'mapping',
  'mappings',
  'metric',
  'ontology',
];

/** Writes deterministic standalone modules and their TypeScript declarations. */
export function compileSchemas(destination = 'src/generated') {
  mkdirSync(destination, { recursive: true });
  const legacyDirectory = join(destination, 'schema-validators');
  if (existsSync(legacyDirectory)) {
    for (const name of oldOutputs) {
      for (const extension of ['.js', '.d.ts']) {
        const path = join(legacyDirectory, `${name}${extension}`);
        if (existsSync(path)) unlinkSync(path);
      }
    }
    if (readdirSync(legacyDirectory).length === 0) rmdirSync(legacyDirectory);
  }
  const imports = new Set([
    "import { fullFormats as formats } from 'ajv-formats/dist/formats.js';",
  ]);
  const modules: string[] = [];
  const exports: string[] = [];
  const declarations: string[] = [];
  for (const [index, output] of outputs.entries()) {
    const runtimeBindings: string[] = [];
    let code = (
      'validator' in output
        ? standaloneCode(output.compiler, output.validator)
        : standaloneCode(output.compiler, output.validators)
    ).replace(/require\("([^"]+)"\)/g, (_match, module: string) => {
      const binding = `${output.name}Runtime${runtimeBindings.length}`;
      imports.add(`import * as ${binding}Module from '${module}.js';`);
      // Bundlers expose a CommonJS module either as its exports or under `default`; take the
      // exports object in both cases so `.default` and named members resolve the same way.
      runtimeBindings.push(
        `const ${binding} = ${binding}Module.default?.__esModule ? ${binding}Module.default : ${binding}Module;`,
      );
      return binding;
    });
    const generatedExports = new Map<string, string>();
    code = code.replace(
      /export const (\w+) = (\w+);/g,
      (_match, name: string, validator: string) => {
        generatedExports.set(name, validator);
        return '';
      },
    );
    code = code.replace(/export default (\w+);/g, (_match, validator: string) => {
      generatedExports.set('validate', validator);
      return '';
    });
    code = code.replace(/^"use strict";/, '');
    const outputNames = 'validator' in output ? [output.name] : Object.keys(output.validators);
    const returned = outputNames.map(name => {
      const validator = generatedExports.get(name === output.name ? 'validate' : name);
      if (!validator) throw new Error(`No generated validator named ${name} in ${output.name}.`);
      return `${name}: ${validator}`;
    });
    modules.push(
      `const generated${index} = (() => { ${runtimeBindings.join('\n')} ${code} return { ${returned.join(', ')} }; })();`,
    );
    exports.push(...outputNames.map(name => `export const ${name} = generated${index}.${name};`));
    declarations.push(
      ...outputNames.map(name => `export declare const ${name}: ValidateFunction;`),
    );
  }
  writeFileSync(
    join(destination, 'validators.js'),
    `// generated, do not edit\n${[...imports].join('\n')}\n${modules.join('\n')}\n${exports.join('\n')}\n`,
  );
  writeFileSync(
    join(destination, 'validators.d.ts'),
    '// generated, do not edit\n' +
      "import type { ValidateFunction } from 'ajv';\n" +
      `${declarations.join('\n')}\n`,
  );
}

if (import.meta.main) compileSchemas();
