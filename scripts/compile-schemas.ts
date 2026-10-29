// Generates browser validators without runtime code compilation under the content security policy.
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';
import standaloneCode from 'ajv/dist/standalone';
import { _ } from 'ajv/dist/compile/codegen';
import addFormats from 'ajv-formats';
import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import odcs from '../schemas/odcs-v3.1.0.json';
import ossie from '../schemas/ossie-0.2.0.dev0.json';
import ontology from '../schemas/ossie-ontology-0.2.0.dev0.json';
import mapping from '../schemas/ossie-mapping-0.2.0.dev0.json';
import metric from '../schemas/semantic-workbench-metric-v1.json';
import bindings from '../schemas/semantic-workbench-mapping-v1.json';

const options = {
  strict: false,
  allErrors: true,
  code: { source: true, esm: true, lines: true, formats: _`formats` },
};
const contracts = new Ajv2019(options);
const semantics = new Ajv2020(options);
const mappings = new Ajv2020(options);
const extensions = new Ajv2020(options);
for (const validator of [contracts, semantics, mappings]) addFormats(validator);
mappings.addFormat('iri', /^[a-z][a-z\d+.-]*:[^\s]+$/i);
const ontologyId = 'https://raw.githubusercontent.com/apache/ossie/main/ontology/ontology.json';
mappings.addSchema(ossie, 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json');
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
  {
    name: 'contract',
    compiler: contracts,
    validator: contracts.compile(odcs),
    schemaRoots: [{ name: 'odcsContract', schema: odcs }],
  },
  {
    name: 'semantic',
    compiler: semantics,
    validator: semantics.compile(ossie),
    schemaRoots: [{ name: 'ossieSemanticModel', schema: ossie }],
  },
  {
    name: 'mappings',
    compiler: mappings,
    schemaRoots: [
      { name: 'ossieMapping', schema: mapping },
      { name: 'ossieOntology', schema: ontology },
      { name: 'ossieSemanticModel', schema: ossie },
    ],
    validators: {
      standalone: mappingRef,
      embedded: embeddedMappingRef,
      ontology: ontologyId,
    },
  },
  {
    name: 'extensions',
    compiler: extensions,
    schemaRoots: [
      { name: 'metricExtension', schema: metric },
      { name: 'mappingExtension', schema: bindings },
    ],
    validators: { metric: metricRef, mapping: mappingExtensionRef },
  },
] as const;
const oldOutputs = ['contract', 'semantic', 'embedded-mapping', 'extensions', 'mapping-extension', 'mapping', 'mappings', 'metric', 'ontology', 'validators'];

const schemaChildKeywords = ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas'] as const;
const schemaDescriptionStopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'be',
  'by',
  'details',
  'for',
  'from',
  'in',
  'is',
  'may',
  'of',
  'on',
  'or',
  'some',
  'the',
  'that',
  'this',
  'to',
  'used',
  'where',
  'which',
  'with',
]);
const schemaSingleChildKeywords = ['additionalProperties', 'contains', 'if', 'not', 'propertyNames'] as const;
const schemaArrayChildKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pascalCase(value: string): string {
  return (value.match(/[A-Za-z0-9]+/g) ?? []).map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

function schemaNameFromDescription(rootName: string, declaration: ts.VariableDeclaration): string {
  if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) return `${pascalCase(rootName)}SchemaComponent`;
  const properties = declaration.initializer.properties;
  const stringProperty = (name: string) => {
    const property = properties.find(item => ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === name);
    if (!property || !ts.isPropertyAssignment(property) || (!ts.isStringLiteral(property.initializer) && !ts.isNoSubstitutionTemplateLiteral(property.initializer))) return undefined;
    return property.initializer.text;
  };
  const title = stringProperty('title');
  const description = stringProperty('description');
  const sourceName = title ?? description;
  if (sourceName) {
    const words = sourceName.match(/[A-Za-z0-9]+/g) ?? [];
    const seen = new Set<string>();
    const meaningfulWords = title
      ? words.slice(0, 5)
      : words
          .filter(word => {
            const normalized = word.toLowerCase();
            if (schemaDescriptionStopWords.has(normalized) || seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
          })
          .slice(0, 4);
    const name = meaningfulWords.map(word => pascalCase(word)).join('');
    if (name) return `${name}Schema`;
  }
  return `${pascalCase(rootName)}SchemaComponent`;
}

function schemaNames(roots: readonly { name: string; schema: object }[]): WeakMap<object, string> {
  const names = new WeakMap<object, string>();
  const visit = (schema: unknown, name: string): void => {
    if (!isRecord(schema) || names.has(schema)) return;
    names.set(schema, `${name}Schema`);
    for (const keyword of schemaChildKeywords) {
      const children = schema[keyword];
      if (!isRecord(children)) continue;
      for (const [key, child] of Object.entries(children)) visit(child, `${name}${pascalCase(key)}`);
    }
    for (const keyword of schemaSingleChildKeywords) if (isRecord(schema[keyword])) visit(schema[keyword], `${name}${pascalCase(keyword)}`);
    for (const keyword of schemaArrayChildKeywords) {
      const children = schema[keyword];
      if (!Array.isArray(children)) continue;
      children.forEach((child, index) => visit(child, `${name}${pascalCase(keyword)}${index + 1}`));
    }
    if (isRecord(schema.items)) visit(schema.items, `${name}Item`);
    else if (Array.isArray(schema.items)) schema.items.forEach((child, index) => visit(child, `${name}Item${index + 1}`));
    if (isRecord(schema.else)) visit(schema.else, `${name}Else`);
    if (isRecord(schema.then)) visit(schema.then, `${name}Then`);
  };
  for (const root of roots) visit(root.schema, root.name);
  return names;
}

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
  const imports = new Set<string>();
  const modules: string[] = [];
  const exports: string[] = [];
  const declarations: string[] = [];
  for (const output of outputs) {
    const runtimeImports: string[] = [];
    const generated = ('validator' in output ? standaloneCode(output.compiler, output.validator) : standaloneCode(output.compiler, output.validators)).replace(/^"use strict";/, '');
    const knownSchemaNames = schemaNames(output.schemaRoots);
    const validators =
      'validator' in output
        ? [output.validator]
        : Object.values(output.validators)
            .map(ref => output.compiler.getSchema(ref))
            .filter((validator): validator is NonNullable<typeof validator> => !!validator);
    const namesByAjvSymbol = new Map<string, string>();
    for (const validator of validators) {
      for (const symbol of validator.source?.scopeValues.schema ?? []) {
        const value = symbol.value;
        if (!isRecord(value) || !isRecord(value.ref)) throw new Error(`AJV did not provide source schema metadata for ${output.name} ${symbol.str}.`);
        const reference = value.ref;
        const schemaName =
          knownSchemaNames.get(reference) ??
          `${output.schemaRoots[0].name}${pascalCase(typeof reference.title === 'string' ? reference.title : typeof reference.description === 'string' ? reference.description : 'Referenced')}Schema`;
        namesByAjvSymbol.set(symbol.str, schemaName);
      }
    }
    const generatedSource = ts.createSourceFile(`${output.name}.js`, generated, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const usedNames = new Set<string>();
    const schemaVariableNames = new Map<string, string>();
    const assignNames = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^schema\d+$/.test(node.name.text)) {
        const preferred = namesByAjvSymbol.get(node.name.text) ?? schemaNameFromDescription(output.schemaRoots[0].name, node);
        let name = preferred;
        let suffix = 2;
        while (usedNames.has(name)) name = `${preferred.replace(/Schema$/, '')}Schema${suffix++}`;
        usedNames.add(name);
        schemaVariableNames.set(node.name.text, name);
      }
      ts.forEachChild(node, assignNames);
    };
    assignNames(generatedSource);
    const namedGenerated = generated.replace(/\bschema\d+\b/g, symbol => {
      const name = schemaVariableNames.get(symbol);
      if (!name) throw new Error(`No descriptive source name found for ${output.name} ${symbol}.`);
      return name;
    });
    if (/\bformats\./.test(generated)) imports.add("import { fullFormats as formats } from 'ajv-formats/dist/formats.js';");
    const code = namedGenerated.replace(/require\("([^"]+)"\)/g, (_match, module: string) => {
      const binding = `${output.name}Runtime${runtimeImports.length}`;
      imports.add(`import * as ${binding}Module from '${module}.js';`);
      // Bundlers expose a CommonJS module either as its exports or under `default`; take the
      // exports object in both cases so `.default` and named members resolve the same way.
      runtimeImports.push(`const ${binding} = ${binding}Module.default?.__esModule ? ${binding}Module.default : ${binding}Module;`);
      return binding;
    });
    const generatedExports = new Map<string, string>();
    const body = code
      .replace(/^"use strict";/, '')
      .replace(/export const (\w+) = (\w+);/g, (_match, name: string, validator: string) => {
        generatedExports.set(name, validator);
        return '';
      })
      .replace(/export default (\w+);/g, (_match, validator: string) => {
        generatedExports.set('validate', validator);
        return '';
      });
    const outputNames = 'validator' in output ? [output.name] : Object.keys(output.validators);
    const returned = outputNames.map(name => {
      const validator = generatedExports.get(name === output.name ? 'validate' : name);
      if (!validator) throw new Error(`No generated validator named ${name} in ${output.name}.`);
      return `${name}: ${validator}`;
    });
    const moduleName = `generated${pascalCase(output.name)}`;
    modules.push(`const ${moduleName} = (() => {\n${runtimeImports.join('\n')}\n${body}\nreturn { ${returned.join(', ')} };\n})();`);
    exports.push(...outputNames.map(name => `export const ${name} = ${moduleName}.${name};`));
    declarations.push(...outputNames.map(name => `export declare const ${name}: ValidateFunction;`));
  }
  const jsPath = join(destination, 'validators.js');
  const declarationPath = join(destination, 'validators.d.ts');
  writeFileSync(jsPath, `// generated, do not edit\n${[...imports].join('\n')}\n${modules.join('\n')}\n${exports.join('\n')}\n`);
  writeFileSync(declarationPath, '// generated, do not edit\n' + "import type { ValidateFunction } from 'ajv';\n" + `${declarations.join('\n')}\n`);
  for (const name of oldOutputs) {
    if (name === 'validators') continue;
    for (const extension of ['.js', '.d.ts']) {
      const path = join(destination, `${name}${extension}`);
      if (existsSync(path)) unlinkSync(path);
    }
  }
  const formatted = Bun.spawnSync([process.execPath, 'x', 'oxfmt', '--config', join(process.cwd(), '.oxfmtrc.json'), jsPath, declarationPath]);
  if (formatted.exitCode !== 0) {
    throw new Error(`Oxfmt failed to format generated validators: ${formatted.stderr.toString()}`);
  }
}

if (import.meta.main) compileSchemas();
