import { expect, test } from 'bun:test';
import { buildPlan, exerciseFakeDelivery, validatePlan } from '../../scripts/pipeline-dry-run';
import { lintRules, readPipelineInput, readSampleVariables } from '../../scripts/pipeline-lint';

for (const run of ['pr', 'main', 'tag:v0.4.0-alpha.1']) {
  test(`delivery stage is expanded with tag-only execution for ${run}`, () => {
    const plan = buildPlan(lintRules(readPipelineInput()), readSampleVariables(), run);
    expect([...new Set(plan.map(step => step.stage))]).toEqual(['Validate', 'Image', 'Deploy']);
    const deploy = plan.filter(step => step.stage === 'Deploy');
    expect(
      deploy.every(
        step =>
          step.enabled ===
          (run.startsWith('tag:') &&
            !step.command.includes('playwright install') &&
            step.command !== 'bun install --frozen-lockfile'),
      ),
    ).toBe(true);
    expect(deploy.filter(step => step.kind === 'azure').map(step => step.command)).toEqual([
      'bun run image:scan -- --ref-env IMAGE_REF',
      'bun run deploy:azure',
    ]);
    expect(deploy.at(-1)?.env?.IMAGE_DIGEST).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
}

test('manual rollback is expanded on the same protected environment', () => {
  const plan = buildPlan(
    lintRules(readPipelineInput()),
    readSampleVariables(),
    'tag:v0.4.0-alpha.1',
    'rollback',
  );
  expect([...new Set(plan.map(step => step.stage))]).toEqual(['Rollback']);
  expect(plan.at(-1)?.command).toBe('bun run deploy:rollback');
  expect(plan.at(-1)?.env?.ROLLBACK_TARGET).toBe('tag');
});

test('dry-run fake exercises include failed smoke and restoration', exerciseFakeDelivery);

for (const [file, before, after] of [
  ['azure-pipelines.yml', 'lockBehavior: runLatest', 'lockBehavior: sequential'],
  ['azure-pipelines-rollback.yml', 'trigger: none', 'trigger: [main]'],
  ['azure-pipelines-rollback.yml', 'lockBehavior: runLatest', 'lockBehavior: sequential'],
  ['deploy/azure-devops/templates/deploy-steps.yml', 'bun run deploy:azure', 'bun run absent'],
]) {
  test(`delivery lint refuses ${file} ${after}`, () => {
    const input = readPipelineInput();
    input.files[file] = input.files[file].replace(before, after);
    expect(() => lintRules(input)).toThrow();
  });
}

for (const run of ['pr', 'main', 'tag:v0.4.0']) {
  test(`rollback plan validates connection, setup and tag-only work for ${run}`, () => {
    const sample = readSampleVariables();
    const plan = buildPlan(lintRules(readPipelineInput()), sample, run, 'rollback');
    const connection = sample.parameters.deployServiceConnection;
    expect(() => validatePlan(plan, connection)).not.toThrow();
    const delivery = plan.at(-1)!;
    expect(() => validatePlan([...plan, delivery], connection)).toThrow('exactly one');
    expect(() => validatePlan(plan, 'wrong')).toThrow('deploy connection');
    expect(() =>
      validatePlan(
        plan.filter(step => step.kind !== 'setup'),
        connection,
      ),
    ).toThrow();
    expect(() =>
      validatePlan(
        plan.map(step => (step.kind === 'azure' ? { ...step, enabled: !step.enabled } : step)),
        connection,
      ),
    ).toThrow();
    expect(plan.filter(step => step.command === 'checkout: self')).toHaveLength(1);
    expect(plan.find(step => step.command.includes('playwright install'))?.enabled).toBe(false);
  });
}

test('browser setup defaults on for validation and off for deployment', () => {
  const plan = buildPlan(lintRules(readPipelineInput()), readSampleVariables(), 'tag:v0.4.0');
  const installs = plan.filter(step => step.command.includes('playwright install'));
  expect(installs.filter(step => step.stage === 'Validate').every(step => step.enabled)).toBe(true);
  expect(installs.find(step => step.stage === 'Deploy')?.enabled).toBe(false);
  expect(
    plan.filter(step => step.stage === 'Deploy' && step.command === 'checkout: self'),
  ).toHaveLength(1);
});

test('trial follows the delivered tag and checks previous after automatic recovery', async () => {
  const runbook = await Bun.file('deploy/trial-runbook.md').text();
  expect(runbook).toContain('<release-tag>');
  expect(runbook).toContain('v0.4.0');
  expect(runbook).not.toContain('v0.4.0-alpha.1');
  expect(runbook).toContain('next prerelease or patch tag');
  expect(runbook).toContain('bump `package.json`');
  expect(runbook).toContain('`target=previous` after automatic restore');
  expect(runbook).toContain('never the failed digest');
});
