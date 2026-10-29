// Checks that validation either checks a file fully or says plainly that it did not.
import { describe, expect, test } from 'bun:test';
import { EXAMPLE_SETS } from '../src/shared/projects/examples';
import { validateInput } from '../src/shared/validation/input';
import { OSSIE_SCHEMA_VERSION } from '../src/shared/validation/validation';
import { runShaclShapes } from '../src/shared/validation/shacl';

const exampleFiles = EXAMPLE_SETS.flatMap(set => set.files.map(filename => ({ set: set.id, filename, path: `public/examples/${set.folder}/${filename}` })));

describe('bundled examples', () => {
  for (const example of exampleFiles) {
    test(`${example.set}/${example.filename} validates with no problems and no warnings`, async () => {
      const source = await Bun.file(example.path).text();
      const result = validateInput(source, example.filename);
      expect(result.issues).toEqual([]);
    });
  }
});

const ontologyWithBrokenReference = (version: string) => [`version: "${version}"`, 'name: ubl', 'ontology:', '  - concept: Order', '    iri: ubl:Order', '    extends: [Missing]', ''].join('\n');

describe('an Ossie version the app has no schema for', () => {
  test('is reported once as not validated, with no per-line findings', () => {
    const result = validateInput(ontologyWithBrokenReference('0.3.1'), 'ubl.ontology.yaml');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'info', code: 'not-validated' });
    expect(result.issues[0]!.message).toBe(`Not validated — this app checks Ossie ${OSSIE_SCHEMA_VERSION}, the file says 0.3.1.`);
    expect(result.issues[0]!.line).toBeUndefined();
  });

  test('says so when the file declares no version', () => {
    const source = ontologyWithBrokenReference('0.3.1').replace(/version: .*\n/, '');
    const result = validateInput(source, 'ubl.ontology.yaml');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.message).toContain('the file declares no version');
  });

  test('is checked against the shipped schema when the user asks for that', () => {
    const result = validateInput(ontologyWithBrokenReference('0.3.1'), 'ubl.ontology.yaml', { assumeOssieVersion: true });
    expect(result.valid).toBe(false);
    expect(result.issues.some(issue => issue.code === 'reference')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'not-validated')).toBe(false);
  });

  test('still reports syntax errors', () => {
    const result = validateInput('version: "0.3.1"\nontology: [unclosed', 'broken.ontology.yaml');
    expect(result.valid).toBe(false);
    expect(result.issues[0]!.code).toBe('syntax');
  });

  test('a file on the shipped version is validated and reports real problems only', () => {
    const result = validateInput(ontologyWithBrokenReference(OSSIE_SCHEMA_VERSION), 'ubl.ontology.yaml');
    expect(result.valid).toBe(false);
    expect(result.issues.every(issue => issue.code !== 'not-validated')).toBe(true);
  });
});

const shapes = {
  filename: 'orders.shapes.ttl',
  source: `
@prefix ex: <http://ex.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
ex:OrderShape a sh:NodeShape ; sh:targetClass ex:Order ;
  sh:property [ sh:path ex:customer ; sh:minCount 1 ] .
ex:InvoiceShape a sh:NodeShape ; sh:targetClass ex:Invoice ;
  sh:sparql [ a sh:SPARQLConstraint ; rdfs:label "total is not negative" ; sh:message "total is negative" ;
    sh:prefixes ex: ;
    sh:select "SELECT $this ?value WHERE { $this ex:total ?value . FILTER(?value < 0) }" ] .
ex: sh:declare [ sh:prefix "ex" ; sh:namespace "http://ex.org/"^^xsd:anyURI ] .
`,
};

describe('running shapes against a data file', () => {
  test('reports the node and the rule for each violation, SPARQL rules included', async () => {
    const data = {
      filename: 'orders.data.ttl',
      source: `
@prefix ex: <http://ex.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:o1042 a ex:Order ; rdfs:label "Order 1042" .
ex:i77 a ex:Invoice ; rdfs:label "Invoice 77" ; ex:total "-5"^^xsd:decimal .
`,
    };
    const report = await runShaclShapes(shapes, data);
    expect(report.conforms).toBe(false);
    expect(report.findings).toHaveLength(2);
    const order = report.findings.find(finding => finding.focusNode === 'http://ex.org/o1042')!;
    expect(order).toMatchObject({ focusLabel: 'Order 1042', shape: 'ex:OrderShape', rule: 'sh:minCount on ex:customer', severity: 'error' });
    const invoice = report.findings.find(finding => finding.focusNode === 'http://ex.org/i77')!;
    expect(invoice).toMatchObject({ focusLabel: 'Invoice 77', shape: 'ex:InvoiceShape', rule: 'SPARQL rule "total is not negative"', message: 'total is negative' });
  });

  test('finds nothing when the data satisfies the shapes', async () => {
    const data = { filename: 'orders.data.ttl', source: '@prefix ex: <http://ex.org/> . ex:o1 a ex:Order ; ex:customer ex:alex .' };
    const report = await runShaclShapes(shapes, data);
    expect(report).toEqual({ conforms: true, findings: [] });
  });

  test('rejects data that is not valid RDF with the file name in the message', async () => {
    const data = { filename: 'broken.ttl', source: '@prefix ex: <http://ex.org/> . ex:o1 a' };
    await expect(runShaclShapes(shapes, data)).rejects.toThrow('broken.ttl');
  });
});

describe('bundled shapes', () => {
  const pairs = [
    ['commerce/commerce.shacl.ttl', 'commerce/commerce-data.ttl'],
    ['mall/mall.shacl.ttl', 'mall/mall-data.ttl'],
  ] as const;
  for (const [shapesPath, dataPath] of pairs) {
    test(`${shapesPath} finds nothing in ${dataPath}`, async () => {
      const shapesFile = { filename: shapesPath, source: await Bun.file(`public/examples/${shapesPath}`).text() };
      const dataFile = { filename: dataPath, source: await Bun.file(`public/examples/${dataPath}`).text() };
      const report = await runShaclShapes(shapesFile, dataFile);
      expect(report.findings).toEqual([]);
    });
  }
});
