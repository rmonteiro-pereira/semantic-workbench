import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { stringify } from 'yaml';
import {
  checkScript,
  lintPipeline,
  lintRules,
  readPipelineInput,
} from '../../scripts/pipeline-lint';
import { gateSuites } from '../../scripts/gate-suites';

const schemaBytes = readFileSync('deploy/azure-devops/schema/service-schema.json');
const schema = JSON.parse(schemaBytes.toString());
const template = 'deploy/azure-devops/templates/validate-jobs.yml';

test('schema provenance and absence of GitHub automation', () => {
  expect(createHash('sha256').update(schemaBytes).digest('hex')).toBe(
    'f00a9630f6550204148634d9a13f634b5750a225559886effe09a751482f0459',
  );
  expect(existsSync('.github/workflows/')).toBe(false);
  expect(existsSync('.github/dependabot.yml')).toBe(false);
  expect(readFileSync('scripts/container-check.ts', 'utf8')).toContain(
    "import { gateSuites } from './gate-suites'",
  );
  expect(gateSuites.length).toBeGreaterThan(0);
});

test('all delivered pipeline files pass schema and repository rules offline', () => {
  expect(() => lintPipeline(readPipelineInput(), schema)).not.toThrow();
});

test('schema rejects a malformed stage independently of repository rules', () => {
  const input = readPipelineInput();
  input.files['azure-pipelines.yml'] = 'stages: 42';
  expect(() => lintPipeline(input, schema)).toThrow('schema');
});

test('only a single existing package script can execute outside setup', () => {
  for (const command of [
    'bun run absent',
    'echo unsafe',
    'bun run check; echo unsafe',
    'bun run check && echo unsafe',
    'bun run check $(whoami)',
    'bun run check\necho unsafe',
  ]) {
    expect(() => checkScript(command, { check: 'tsc' })).toThrow();
  }
  expect(() => checkScript('bun run check -- --value $(ACR_NAME)', { check: 'tsc' })).not.toThrow();
});

const invalidNodes = [
  { bash: 'bun run absent' },
  { displayName: 'Keycloak' },
  { services: { provider: 'some-image' } },
  { task: 'Bash@3' },
  { task: 'AzureCLI@2.1' },
  { task: 'PublishTestResults' },
  { image: 'untrusted:latest' },
  { isSecret: true },
  { addSpnToEnvironment: true },
  { clientSecret: 'literal-secret' },
  { name: 'CLIENT_SECRET', value: 'literal' },
  { azureSubscription: '$(connection)' },
  { deployment: 'deploy', environment: 'production' },
  {
    deployment: 'deploy',
    environment: '${{ parameters.deployEnvironment }}',
    strategy: { runOnce: { deploy: { steps: [] } } },
  },
  { stage: 'Deploy', condition: 'succeeded()', jobs: [] },
];
for (const node of invalidNodes) {
  test(`rejects forbidden pipeline node ${JSON.stringify(node)}`, () => {
    const input = readPipelineInput();
    input.files['deploy/azure-devops/templates/invalid.yml'] = stringify({ steps: [node] });
    expect(() => lintRules(input)).toThrow();
  });
}

test('gate coverage, stage order, pipeline job, ignores and automation are enforced', () => {
  const variants = [
    (input: ReturnType<typeof readPipelineInput>) => {
      input.scripts['test:new'] = 'bun new.ts';
    },
    (input: ReturnType<typeof readPipelineInput>) => {
      input.files['azure-pipelines.yml'] = input.files['azure-pipelines.yml'].replace(
        'stage: Image',
        'stage: Other',
      );
    },
    (input: ReturnType<typeof readPipelineInput>) => {
      input.files[template] = input.files[template].replace('job: pipeline', 'job: missing');
    },
    (input: ReturnType<typeof readPipelineInput>) => {
      input.files[template] = input.files[template].replace('suite: test:ui', 'suite: test:absent');
    },
    (input: ReturnType<typeof readPipelineInput>) => {
      input.ignore = 'CVE-2026-1234';
    },
    (input: ReturnType<typeof readPipelineInput>) => {
      input.forbiddenPaths = ['.github/workflows'];
    },
  ];
  for (const change of variants) {
    const input = readPipelineInput();
    change(input);
    expect(() => lintRules(input)).toThrow();
  }
});

for (const macro of [
  'Build.SourceVersionMessage',
  'Build.SourceBranchName',
  'System.JobId',
  'OTHER',
]) {
  for (const key of ['bash', 'script', 'inlineScript']) {
    test(`rejects ${macro} in ${key} commands`, () => {
      const input = readPipelineInput();
      input.files['deploy/azure-devops/templates/unsafe.yml'] = stringify({
        steps: [{ [key]: `bun run check -- --value $(${macro})` }],
      });
      expect(() => lintRules(input)).toThrow('Shell logic');
    });
  }
}

const imageTemplate = 'deploy/azure-devops/templates/image-jobs.yml';
const setupTemplate = 'deploy/azure-devops/templates/setup-steps.yml';
const securityFixtures: [string, string, string, string][] = [
  [
    'literal connection',
    'azure-pipelines.yml',
    'acrServiceConnection: ${{ parameters.acrServiceConnection }}',
    'acrServiceConnection: privileged',
  ],
  [
    'swapped connection',
    'azure-pipelines.yml',
    'acrServiceConnection: ${{ parameters.acrServiceConnection }}',
    'acrServiceConnection: ${{ parameters.deployServiceConnection }}',
  ],
  ['connection default', imageTemplate, 'type: string', 'type: string\n    default: privileged'],
  [
    'deploy connection in Image',
    imageTemplate,
    'azureSubscription: ${{ parameters.acrServiceConnection }}',
    'azureSubscription: ${{ parameters.deployServiceConnection }}',
  ],
  [
    'external template',
    imageTemplate,
    'template: setup-steps.yml',
    'template: setup-steps.yml@external',
  ],
  [
    'unlinted template',
    imageTemplate,
    'template: setup-steps.yml',
    'template: ../../../outside.yml',
  ],
  [
    'unpinned installer',
    setupTemplate,
    'https://github.com/oven-sh/bun/releases/download/bun-v1.4.3/bun-linux-x64.zip',
    'https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip',
  ],
  ['unchecked installer', setupTemplate, 'sha256sum -c -', 'cat'],
  [
    'wrong checksum',
    setupTemplate,
    '3e730528d89775f03f87f05c06787c4df4099d0a37f3f252e7b829cb23816e18',
    '0'.repeat(64),
  ],
  [
    'curl pipe bash',
    setupTemplate,
    'bun install --frozen-lockfile',
    'curl https://bun.sh/install | bash',
  ],
];
for (const [name, file, before, after] of securityFixtures) {
  test(`rejects ${name} fixture`, () => {
    const input = readPipelineInput();
    expect(input.files[file]).toContain(before);
    input.files[file] = input.files[file].replace(before, after);
    expect(() => lintRules(input)).toThrow();
  });
}

test('Deploy condition cannot hide a tag prefix inside an always-true alternative', () => {
  const input = readPipelineInput();
  input.files['deploy/azure-devops/templates/unsafe.yml'] = stringify({
    stages: [
      {
        stage: 'Deploy',
        condition: "or(always(), startsWith(variables['Build.SourceBranch'], 'refs/tags/v'))",
        jobs: [{ deployment: 'deploy' }],
      },
    ],
  });
  expect(() => lintRules(input)).toThrow('Deploy must be tag-only');
});

test('Validate cannot borrow the image connection', () => {
  const input = readPipelineInput();
  input.files[template] +=
    '\nunused:\n  azureSubscription: ${{ parameters.acrServiceConnection }}\n';
  expect(() => lintRules(input)).toThrow('not allowed in stage Validate');
});

test('Deploy cannot borrow the image connection', () => {
  const input = readPipelineInput();
  input.files['azure-pipelines.yml'] += `
  - stage: Deploy
    condition: and(succeeded(), startsWith(variables['Build.SourceBranch'], 'refs/tags/v'))
    jobs:
      - deployment: deploy
        environment: \${{ parameters.deployEnvironment }}
        strategy:
          runOnce:
            deploy:
              steps:
                - template: deploy/azure-devops/templates/setup-steps.yml
                  parameters:
                    browsers: false
                - task: AzureCLI@2
                  inputs:
                    azureSubscription: \${{ parameters.acrServiceConnection }}
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: bun run check
`;
  expect(() => lintRules(input)).toThrow('not allowed in stage Deploy');
});

test('setup cannot hide commands alongside its pinned installer', () => {
  const input = readPipelineInput();
  input.files[setupTemplate] = input.files[setupTemplate].replace(
    'checkout: self',
    'checkout: self\n    script: echo $(Build.SourceBranchName)',
  );
  expect(() => lintRules(input)).toThrow('Setup must use pinned Bun');
});

test('empty template references fail instead of bypassing resolution', () => {
  const input = readPipelineInput();
  input.files['deploy/azure-devops/templates/unsafe.yml'] = stringify({
    steps: [{ template: '' }],
  });
  expect(() => lintRules(input)).toThrow('nonempty path');
});

test('shorthand service connection defaults cannot bypass declaration checks', () => {
  const input = readPipelineInput();
  input.files['deploy/azure-devops/templates/unsafe.yml'] = stringify({
    parameters: { acrServiceConnection: 'privileged' },
    steps: [],
  });
  expect(() => lintRules(input)).toThrow('without defaults');
});
