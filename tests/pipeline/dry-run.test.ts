import { expect, test } from 'bun:test';
import {
  buildPlan,
  evaluateCondition,
  parseRunKind,
  validatePlan,
} from '../../scripts/pipeline-dry-run';
import { lintRules, readPipelineInput, readSampleVariables } from '../../scripts/pipeline-lint';
import { gateSuites } from '../../scripts/gate-suites';

for (const run of ['pr', 'main', 'tag:v0.4.0-alpha.1']) {
  test(`expands the actual pipeline for ${run}`, () => {
    const plan = buildPlan(lintRules(readPipelineInput()), readSampleVariables(), run);
    expect([...new Set(plan.map(step => step.stage))]).toEqual(['Validate', 'Image', 'Deploy']);
    const deploy = plan.filter(
      step => step.stage === 'Deploy' && !step.command.includes('playwright install'),
    );
    expect(deploy.every(step => step.enabled === run.startsWith('tag:'))).toBe(true);
    const deployAzure = plan.filter(step => step.stage === 'Deploy' && step.kind === 'azure');
    expect(deployAzure.map(step => step.serviceConnection)).toEqual([
      'sw-azure-deploy',
      'sw-azure-deploy',
    ]);
    const browser = plan.filter(step => step.kind === 'local' && step.job.startsWith('browser/'));
    expect(browser).toHaveLength(gateSuites.length);
    expect(browser.every(step => step.enabled)).toBe(true);
    const check = plan.find(step => step.kind === 'azure' && step.job === 'check')!;
    expect(check.enabled).toBe(run.startsWith('tag:'));
    const push = plan.find(step => step.command.includes('image:push'))!;
    expect(push.enabled).toBe(run !== 'pr');
    expect(push.command).toContain('swexample.azurecr.io');
    expect(plan.some(step => step.command.includes('$(') && step.kind === 'local')).toBe(false);
  });
}

test('an extra pipeline command or unknown gate step fails the parity check', () => {
  const plan = buildPlan(lintRules(readPipelineInput()), readSampleVariables(), 'pr');
  expect(() =>
    validatePlan([...plan, { ...plan[0], kind: 'local', command: 'bun run build' }]),
  ).toThrow('not in ci:validate');
  expect(() =>
    validatePlan([
      ...plan,
      { ...plan[0], kind: 'local', command: 'bun run ci:validate -- --step unknown' },
    ]),
  ).toThrow('Unknown gate step');
  expect(() =>
    validatePlan(plan.filter(step => !step.command.includes('--step mutation'))),
  ).toThrow('missing ci:validate step');
});

test('unsupported run kinds and conditions fail rather than guessing', () => {
  expect(() => parseRunKind('tag:latest')).toThrow('Unknown run kind');
  expect(() => evaluateCondition('unsupported()', {})).toThrow('Unsupported');
  expect(evaluateCondition("and(succeeded(), eq('main', 'main'))", {})).toBe(true);
});

test('unknown dependency results fail closed', () => {
  expect(() => evaluateCondition("eq(dependencies.missing.result, 'Succeeded')", {})).toThrow(
    'Unknown dependency',
  );
});

for (const kind of ['stage', 'job'] as const) {
  for (const dependency of ['missing', 'later', 'self']) {
    test(`${kind} rejects ${dependency} dependencies`, () => {
      const documents = lintRules(readPipelineInput());
      const nodes =
        kind === 'stage'
          ? documents['azure-pipelines.yml'].stages
          : documents['deploy/azure-devops/templates/validate-jobs.yml'].jobs;
      nodes[0].dependsOn = dependency === 'self' ? nodes[0][kind] : dependency;
      if (dependency === 'later') nodes[0].dependsOn = nodes[1][kind];
      expect(() => buildPlan(documents, readSampleVariables(), 'pr')).toThrow(
        'unknown or non-earlier',
      );
    });
  }
}

test('stage results are evaluated in dependency order', () => {
  const documents = lintRules(readPipelineInput());
  const stages = documents['azure-pipelines.yml'].stages;
  stages[0].condition = "eq('a', 'b')";
  stages[1].condition = "eq(dependencies.Validate.result, 'Skipped')";
  const plan = buildPlan(documents, readSampleVariables(), 'pr');
  expect(plan.filter(step => step.stage === 'Validate').every(step => !step.enabled)).toBe(true);
  expect(plan.find(step => step.stage === 'Image' && step.job === 'image')?.enabled).toBe(true);
});

test('job results are evaluated in order and isolated between stages', () => {
  const documents = lintRules(readPipelineInput());
  const jobs = documents['deploy/azure-devops/templates/image-jobs.yml'].jobs;
  jobs[1].condition = "eq(dependencies.check.result, 'Skipped')";
  expect(
    buildPlan(documents, readSampleVariables(), 'pr').find(
      step => step.stage === 'Image' && step.job === 'image',
    )?.enabled,
  ).toBe(true);
  jobs[0].condition = "eq(dependencies.verify.result, 'Succeeded')";
  expect(() => buildPlan(documents, readSampleVariables(), 'pr')).toThrow('Unknown dependency');
});

test('root-relative step templates resolve to the same linted file', () => {
  const input = readPipelineInput();
  const path = 'deploy/azure-devops/templates/image-jobs.yml';
  input.files[path] = input.files[path].replaceAll(
    'template: setup-steps.yml',
    'template: /deploy/azure-devops/templates/setup-steps.yml',
  );
  expect(
    buildPlan(lintRules(input), readSampleVariables(), 'pr').some(
      step => step.stage === 'Image' && step.kind === 'setup',
    ),
  ).toBe(true);
});
