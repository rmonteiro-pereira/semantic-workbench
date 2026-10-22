import { serverSuites } from '../../scripts/container-suites';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { lintRules, readPipelineInput } from '../../scripts/pipeline-lint';
import { gateSuites, exclusions, selfServedSuites } from '../../scripts/gate-suites';

for (const name of ['keycloak', 'services', 'container', 'resource']) {
  test(`pipeline rejects the ${name} fixture`, () => {
    const input = readPipelineInput();
    input.files['deploy/azure-devops/templates/forbidden.yml'] = readFileSync(
      `tests/fixtures/pipeline-auth/${name}.yml`,
      'utf8',
    );
    expect(() => lintRules(input)).toThrow(/forbidden/);
  });
}

test('mock sign-in belongs to the gate and compatibility remains owner-only', () => {
  expect(gateSuites).toContain('test:auth');
  expect(gateSuites).not.toContain('test:auth:keycloak');
  expect(exclusions.find(entry => entry.script === 'test:auth:keycloak')?.reason).toContain(
    "owner's machine",
  );
  const template = readPipelineInput().files['deploy/azure-devops/templates/validate-jobs.yml'];
  expect(template).toContain('suite: test:auth');
  expect(template.toLowerCase()).not.toContain('keycloak');
});

test('server container coverage and self-served browser suites share their inventory', () => {
  expect(serverSuites).toBe(selfServedSuites);
  expect(selfServedSuites).toContain('test:auth');
  for (const suite of selfServedSuites) expect(gateSuites).toContain(suite);
});
