import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gateSuites, exclusions } from './gate-suites';
import { posix } from 'node:path';
import { parseTrivyIgnore, targetVariables } from './image';

/** Ordered stages supported by this delivery definition. */
export const expectedStages = ['Validate', 'Image', 'Deploy'];
const tagCondition = "and(succeeded(), startsWith(variables['Build.SourceBranch'], 'refs/tags/v'))";
const pushCondition = "and(succeeded(), or(eq(variables['Build.SourceBranch'], 'refs/heads/main'), " + "startsWith(variables['Build.SourceBranch'], 'refs/tags/v')))";
/** Files that may hold a service connection, each checked further by its own rule. */
const connectionFiles = ['azure-pipelines.yml', 'azure-pipelines-rollback.yml', 'deploy/azure-devops/templates/image-jobs.yml', 'deploy/azure-devops/templates/deploy-steps.yml'];
/** Parsed YAML mapping, validated against the pinned schema at the file boundary. */
export type PipelineNode = Record<string, any>;
/** Repository inputs kept explicit so rule tests need no filesystem mutations. */
export type PipelineInput = {
  files: Record<string, string>;
  scripts: Record<string, string>;
  ignore: string;
  today: string;
  forbiddenPaths: string[];
};

/** Visits mappings at every depth, including nested task inputs and templates. */
export function visitMappings(value: unknown, visit: (node: PipelineNode) => void): void {
  if (Array.isArray(value)) {
    value.forEach(item => visitMappings(item, visit));
  } else if (value && typeof value === 'object') {
    visit(value as PipelineNode);
    Object.values(value).forEach(item => visitMappings(item, visit));
  }
}

/** Accepts only one package-script invocation, with no shell execution hidden in arguments. */
export function checkScript(command: string, scripts: Record<string, string>): void {
  const match = /^bun run ([\w:-]+)(?:\s+[^\n\r]*)?$/.exec(command.trim());
  if (!match || !Object.hasOwn(scripts, match[1])) {
    throw Error(`Step must call a package script: ${command}`);
  }
  const literal = command.replace(/\$\(([^)]+)\)/g, (macro, name) => (name === 'suite' || targetVariables.includes(name) ? 'variable' : macro));
  if (/[;&|`<>\n\r]|\$|\\/.test(literal)) throw Error(`Shell logic is forbidden: ${command}`);
}

function checkTask(node: PipelineNode) {
  if (node.task && !['AzureCLI@2', 'PublishTestResults@2', 'PublishPipelineArtifact@1'].includes(node.task)) throw Error(`Task is not allowed or major-pinned: ${node.task}`);
  if (node.azureSubscription && !/^\$\{\{ parameters\.(acr|acrPull|deploy)ServiceConnection \}\}$/.test(node.azureSubscription))
    throw Error('azureSubscription must use a service-connection parameter');
  if (node.task === 'AzureCLI@2' && (!node.inputs?.azureSubscription || !node.inputs?.inlineScript || node.inputs.scriptType !== 'bash' || node.inputs.scriptLocation !== 'inlineScript')) {
    throw Error('AzureCLI must invoke a package script inline');
  }
}

function checkSecurity(node: PipelineNode) {
  if ('services' in node || 'container' in node || 'containers' in node) throw Error('Service containers are forbidden');
  if (node.isSecret === true || node.secret === true || node.addSpnToEnvironment === true || node.isSecret === 'true' || node.secret === 'true' || node.addSpnToEnvironment === 'true') {
    throw Error('Secret variables and service-principal environment exposure are forbidden');
  }
  if (typeof node.name === 'string' && /secret|password|token|private.?key/i.test(node.name) && typeof node.value === 'string' && !/^\$\([\w.]+\)$/.test(node.value)) {
    throw Error(`Secret-looking variable: ${node.name}`);
  }
  for (const [key, value] of Object.entries(node)) {
    if (typeof value !== 'string') continue;
    if (/^(image|container)$/.test(key) && !/@sha256:[a-f0-9]{64}$/.test(value)) {
      throw Error(`Container image must be pinned by digest: ${value}`);
    }
    if (/password|client.?secret|access.?token|private.?key/i.test(key) && !/^\$\([\w.]+\)$/.test(value)) throw Error(`Secret-looking literal: ${key}`);
    if (/-----BEGIN .*PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{20,}|\beyJ[\w-]+\.eyJ/.test(value)) {
      throw Error('Secret-looking literal in pipeline');
    }
  }
}

function checkDeployment(node: PipelineNode) {
  if (node.stage === 'Deploy') {
    if (node.condition !== tagCondition) {
      throw Error('Deploy must be tag-only');
    }
    if (!node.jobs?.some((job: PipelineNode) => job.deployment)) {
      throw Error('Deploy must contain a deployment job');
    }
  }
  if (!node.deployment) return;
  if (node.environment !== '${{ parameters.deployEnvironment }}') {
    throw Error('Deployment must use the environment parameter');
  }
  const steps = node.strategy?.runOnce?.deploy?.steps ?? [];
  if (steps.some((step: PipelineNode) => step.checkout) || !steps.some((step: PipelineNode) => step.template?.endsWith('setup-steps.yml') && step.parameters?.browsers === false)) {
    throw Error('Deployment requires setup-steps.yml with browsers disabled and no duplicate checkout');
  }
}

function checkFile(path: string, source: string, scripts: Record<string, string>) {
  if (/keycloak/i.test(source)) throw Error(`${path}: Keycloak reference is forbidden`);
  const document = parse(source);
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw Error(`${path}: expected a YAML mapping`);
  }
  visitMappings(document, node => {
    checkSecurity(node);
    checkTask(node);
    checkDeployment(node);
    for (const key of ['script', 'bash', 'inlineScript', 'pwsh', 'powershell']) {
      if (typeof node[key] !== 'string' || path === 'deploy/azure-devops/templates/setup-steps.yml') continue;
      checkScript(node[key], scripts);
    }
  });
  return document as PipelineNode;
}

function checkSuites(documents: Record<string, PipelineNode>, scripts: Record<string, string>) {
  const recorded = [...gateSuites, ...exclusions.map(entry => entry.script)];
  for (const script of Object.keys(scripts).filter(name => name.startsWith('test:'))) {
    if (recorded.filter(name => name === script).length !== 1) {
      throw Error(`Test script must appear exactly once in gate suites or exclusions: ${script}`);
    }
  }
  if (exclusions.some(entry => !entry.reason.trim())) throw Error('Exclusions require reasons');
  const validate = documents['deploy/azure-devops/templates/validate-jobs.yml'];
  const jobs = validate?.jobs ?? [];
  if (!jobs.some((job: PipelineNode) => job.job === 'pipeline')) {
    throw Error('Validate lacks the pipeline job');
  }
  const matrix = jobs.find((job: PipelineNode) => job.job === 'browser')?.strategy?.matrix ?? {};
  const suites = Object.values(matrix)
    .map(leg => (leg as PipelineNode).suite)
    .sort();
  if (JSON.stringify(suites) !== JSON.stringify([...gateSuites].sort())) {
    throw Error('Browser matrix differs from gate suites');
  }
}

function checkSetup(document: PipelineNode) {
  const steps = document.steps;
  const install =
    [
      'set -euo pipefail',
      'curl -fsSL \\',
      '  https://github.com/oven-sh/bun/releases/download/bun-v1.4.3/bun-linux-x64.zip -o bun.zip',
      'echo "3e730528d89775f03f87f05c06787c4df4099d0a37f3f252e7b829cb23816e18  bun.zip" \\',
      '  | sha256sum -c -',
      'unzip -o bun.zip -d "$HOME/.bun-1.4.3"',
      'echo "##vso[task.prependpath]$HOME/.bun-1.4.3/bun-linux-x64"',
    ].join('\n') + '\n';
  const expectedSteps = [
    { checkout: 'self', fetchDepth: '${{ parameters.fetchDepth }}' },
    { bash: install, displayName: 'Install Bun 1.4.3' },
    {
      bash: 'bun install --frozen-lockfile',
      condition: "and(succeeded(), eq('${{ parameters.production }}', 'false'))",
    },
    {
      bash: 'bun install --frozen-lockfile --production',
      condition: "and(succeeded(), eq('${{ parameters.production }}', 'true'))",
    },
    {
      bash: 'bun x playwright install --with-deps chromium',
      condition: 'and(succeeded(), ${{ parameters.browsers }})',
    },
  ];
  const expectedParameters = [
    { name: 'browsers', type: 'boolean', default: 'true' },
    { name: 'production', type: 'boolean', default: 'false' },
    { name: 'fetchDepth', type: 'number', default: '1' },
  ];
  if (JSON.stringify(document.parameters) !== JSON.stringify(expectedParameters) || JSON.stringify(steps) !== JSON.stringify(expectedSteps)) {
    throw Error('Setup must use pinned Bun, frozen installs and its production switch');
  }
}

function checkStageTemplates(pipeline: PipelineNode) {
  for (const stage of pipeline.stages) {
    if (stage.stage === 'Deploy') continue;
    const file = stage.stage.toLowerCase() + '-jobs.yml';
    const expected = `deploy/azure-devops/templates/${file}`;
    if (stage.jobs?.length !== 1 || stage.jobs[0].template !== expected) {
      throw Error(`${stage.stage} must use ${expected}`);
    }
  }
  if (pipeline.stages[0].condition || pipeline.stages[1].condition || pipeline.stages[1].dependsOn !== 'Validate') {
    throw Error('Validate must run every time and Image must follow Validate');
  }
  checkParameters(pipeline, { acrPullServiceConnection: 'sw-azure-pull' });
}

function checkParameters(pipeline: PipelineNode, extraDefaults: Record<string, string> = {}) {
  if (pipeline.variables?.length !== 1 || pipeline.variables[0].group !== '${{ parameters.variableGroup }}') {
    throw Error('Variable group must be selected by parameter');
  }
  const defaults = {
    variableGroup: 'semantic-workbench-target',
    acrServiceConnection: 'sw-azure-push',
    deployServiceConnection: 'sw-azure-deploy',
    deployEnvironment: 'production',
    agentPool: '',
    vmImage: 'ubuntu-latest',
    ...extraDefaults,
  };
  for (const [name, value] of Object.entries(defaults)) {
    const parameter = pipeline.parameters?.find((entry: PipelineNode) => entry.name === name);
    if (parameter?.type !== 'string' || parameter.default !== value) {
      throw Error(`Missing or incorrect parameter: ${name}`);
    }
  }
}

function checkJobCommands(documents: Record<string, PipelineNode>) {
  const validate = documents['deploy/azure-devops/templates/validate-jobs.yml'];
  if (JSON.stringify(validate.jobs.map((job: PipelineNode) => job.job)) !== JSON.stringify(['verify', 'mutation', 'browser', 'pipeline'])) {
    throw Error('Validate must contain verify, mutation, browser and pipeline jobs');
  }
  for (const job of validate.jobs) {
    const suffix = job.job === 'browser' ? ' --suite $(suite)' : '';
    const expected = `bun run ci:validate -- --step ${job.job}${suffix}`;
    if (job.condition || !job.steps.some((step: PipelineNode) => step.bash === expected)) {
      throw Error(`Validate job ${job.job} must run its gate step every time`);
    }
    if (!job.steps.some((step: PipelineNode) => step.template === 'setup-steps.yml') || !job.steps.some((step: PipelineNode) => step.task === 'PublishTestResults@2' && step.condition === 'always()'))
      throw Error(`Job ${job.job} lacks setup or test results`);
  }
  const browser = validate.jobs.find((job: PipelineNode) => job.job === 'browser');
  if (!browser.steps.some((step: PipelineNode) => step.task === 'PublishPipelineArtifact@1' && step.condition === 'failed()')) throw Error('Browser job must publish failure screenshots');
}

function checkImageJobs(documents: Record<string, PipelineNode>) {
  const jobs = documents['deploy/azure-devops/templates/image-jobs.yml']?.jobs;
  if (jobs?.length !== 2 || jobs[0].job !== 'check' || jobs[1].job !== 'image') {
    throw Error('Image requires check followed by image jobs');
  }
  const connectionSteps = (job: PipelineNode) => job.steps.filter((step: PipelineNode) => step.task === 'AzureCLI@2');
  if (connectionSteps(jobs[0]).length !== 1 || connectionSteps(jobs[1]).length !== 1) {
    throw Error('Image check and image jobs each need exactly one AzureCLI step');
  }
  const check = connectionSteps(jobs[0])[0];
  const setup = jobs[0].steps.find((step: PipelineNode) => step.template?.endsWith('setup-steps.yml'));
  if (
    jobs[0].condition !== tagCondition ||
    check.inputs?.inlineScript !== 'bun run deploy:check-version' ||
    check.inputs?.azureSubscription !== '${{ parameters.acrPullServiceConnection }}' ||
    check.env?.SOURCE_REF !== '$(Build.SourceBranch)' ||
    check.env?.SOURCE_VERSION !== '$(Build.SourceVersion)' ||
    setup?.parameters?.fetchDepth !== 0
  ) {
    throw Error('Tag check must precede publication, use the pull connection and the full history, ' + 'and call deploy:check-version');
  }
  if (jobs[1].dependsOn !== 'check' || jobs[1].condition !== "in(dependencies.check.result, 'Succeeded', 'Skipped')") throw Error('Image must depend on check');
  const steps = jobs[1].steps;
  const build = steps.findIndex((step: PipelineNode) => step.bash === 'bun run ci:validate -- --step image --step container');
  const pushIndex = steps.findIndex((step: PipelineNode) => step.task === 'AzureCLI@2');
  const push = steps[pushIndex];
  if (
    build < 0 ||
    pushIndex <= build ||
    push.condition !== pushCondition ||
    push.name !== 'push' ||
    push.inputs.azureSubscription !== '${{ parameters.acrServiceConnection }}' ||
    push.inputs.inlineScript !== 'bun run image:push -- --registry $(ACR_NAME).azurecr.io'
  ) {
    throw Error('Image must build and test before a main/tag-only push with digest output');
  }
  if (!steps.some((step: PipelineNode) => step.task === 'PublishPipelineArtifact@1' && step.inputs?.targetPath === 'out/image/')) throw Error('Image artifacts are required');
}

/** Keeps every service connection behind a deployment job or a main/tag-only condition. */
function checkConnectionGates(documents: Record<string, PipelineNode>) {
  for (const [file, document] of Object.entries(documents)) {
    visitMappings(document, node => {
      if (node.azureSubscription && !connectionFiles.includes(file)) {
        throw Error(`${file}: service connection outside a deployment or Image job`);
      }
    });
  }
  for (const file of ['azure-pipelines.yml', 'azure-pipelines-rollback.yml']) {
    for (const job of (documents[file]?.stages ?? []).flatMap((stage: PipelineNode) => stage.jobs)) {
      if (job.deployment) continue;
      visitMappings(job, node => {
        if (node.azureSubscription) throw Error(`${file}: service connection outside a deployment`);
      });
    }
  }
  const imageJobs = documents['deploy/azure-devops/templates/image-jobs.yml'].jobs;
  for (const job of imageJobs) {
    for (const step of job.steps) {
      const gates = [step.condition, job.condition];
      if (step.inputs?.azureSubscription && !gates.some(isReleaseGate)) {
        throw Error(`Image job ${job.job}: a service connection step must run on main or tags only`);
      }
    }
  }
}

function isReleaseGate(condition: unknown): boolean {
  return condition === tagCondition || condition === pushCondition;
}

function checkTemplateReferences(documents: Record<string, PipelineNode>) {
  for (const [file, document] of Object.entries(documents)) {
    if (
      !['azure-pipelines.yml', 'azure-pipelines-rollback.yml'].includes(file) &&
      !Array.isArray(document.parameters) &&
      Object.keys(document.parameters ?? {}).some(name => name.endsWith('ServiceConnection'))
    ) {
      throw Error('Service connection template parameters require declarations without defaults');
    }
    visitMappings(document, node => {
      if (!['azure-pipelines.yml', 'azure-pipelines-rollback.yml'].includes(file) && typeof node.name === 'string' && node.name.endsWith('ServiceConnection') && 'default' in node) {
        throw Error(`Service connection template parameter has a default: ${node.name}`);
      }
      if (!Object.hasOwn(node, 'template')) return;
      if (typeof node.template !== 'string' || !node.template) {
        throw Error('Template reference must be a nonempty path');
      }
      const reference = node.template;
      const path = reference.startsWith('/') ? reference.slice(1) : posix.normalize(posix.join(posix.dirname(file), reference));
      if (reference.includes('@') || !Object.hasOwn(documents, path)) {
        throw Error(`Template outside linted set: ${reference}`);
      }
      for (const [name, value] of Object.entries(node.parameters ?? {})) {
        if (name.endsWith('ServiceConnection') && value !== `\${{ parameters.${name} }}`) {
          throw Error(`Service connection must forward the same parameter: ${name}`);
        }
      }
    });
  }
  for (const file of ['azure-pipelines.yml', 'azure-pipelines-rollback.yml']) {
    for (const stage of documents[file]?.stages ?? []) {
      checkStageConnections(documents, stage, stage.stage, [file]);
    }
  }
}

function checkStageConnections(documents: Record<string, PipelineNode>, value: unknown, stage: string, ancestors: string[]) {
  visitMappings(value, node => {
    if (node.azureSubscription) {
      const names = {
        Image: ['acrServiceConnection', 'acrPullServiceConnection'],
        Deploy: ['deployServiceConnection'],
        Rollback: ['deployServiceConnection'],
      }[stage];
      if (!names?.some(name => node.azureSubscription === `\${{ parameters.${name} }}`)) {
        throw Error(`Service connection is not allowed in stage ${stage}`);
      }
    }
    if (!node.template) return;
    const parent = ancestors.at(-1)!;
    const path = node.template.startsWith('/') ? node.template.slice(1) : posix.normalize(posix.join(posix.dirname(parent), node.template));
    if (ancestors.includes(path)) throw Error(`Recursive template: ${path}`);
    checkStageConnections(documents, documents[path], stage, [...ancestors, path]);
  });
}

function checkDelivery(documents: Record<string, PipelineNode>) {
  const rollback = documents['azure-pipelines-rollback.yml'];
  if (rollback?.trigger !== 'none' || rollback.pr !== 'none' || rollback.stages?.length !== 1 || rollback.stages[0].stage !== 'Rollback') {
    throw Error('Rollback must be manual with one Rollback stage');
  }
  checkParameters(rollback);
  const target = rollback.parameters?.find((entry: PipelineNode) => entry.name === 'target');
  if (target?.default !== 'tag' || JSON.stringify(target.values) !== '["tag","previous"]') {
    throw Error('Rollback target must be tag or previous');
  }
  const stages = [documents['azure-pipelines.yml'].stages.find((stage: PipelineNode) => stage.stage === 'Deploy'), rollback.stages[0]];
  for (const stage of stages) {
    if (stage.lockBehavior !== 'runLatest') throw Error('Delivery requires stage runLatest lock');
    if (stage.condition !== tagCondition) {
      throw Error('Delivery must be tag-only');
    }
    if (stage.jobs?.length !== 1 || !stage.jobs[0].deployment) {
      throw Error('Delivery requires one deployment job');
    }
  }
  if (stages[0].dependsOn !== 'Image') throw Error('Deploy must follow Image');
  if (stages[0].variables?.imageDigest !== "$[ stageDependencies.Image.image.outputs['push.digest'] ]") {
    throw Error('Deploy must consume the Image push digest');
  }
  for (const stage of stages) {
    const stageSteps = stage.jobs[0].strategy?.runOnce?.deploy?.steps ?? [];
    const setup = stageSteps.find((step: PipelineNode) => step.template?.endsWith('setup-steps.yml'));
    if (setup?.parameters?.production !== true) {
      throw Error(`${stage.stage} must install production dependencies only`);
    }
  }
  const deployJobSteps = stages[0].jobs[0].strategy?.runOnce?.deploy?.steps ?? [];
  if (!deployJobSteps.some((step: PipelineNode) => step.template === 'deploy/azure-devops/templates/deploy-steps.yml')) {
    throw Error('Deploy must use deploy-steps.yml');
  }
  const rollbackSteps = stages[1].jobs[0].strategy?.runOnce?.deploy?.steps ?? [];
  const restore = rollbackSteps.find((step: PipelineNode) => step.task === 'AzureCLI@2');
  if (restore?.inputs?.inlineScript !== 'bun run deploy:rollback' || restore.env?.SOURCE_REF !== '$(Build.SourceBranch)' || restore.env?.ROLLBACK_TARGET !== '${{ parameters.target }}') {
    throw Error('Rollback must pass its tag ref and target to deploy:rollback');
  }
  const steps = documents['deploy/azure-devops/templates/deploy-steps.yml']?.steps;
  if (steps?.length !== 2 || steps[0].inputs?.inlineScript !== 'bun run image:scan -- --ref-env IMAGE_REF' || steps[1].inputs?.inlineScript !== 'bun run deploy:azure') {
    throw Error('Deploy must rescan before deploy:azure');
  }
  if (
    steps[0].env?.IMAGE_REF !== '$(ACR_NAME).azurecr.io/semantic-workbench@$(imageDigest)' ||
    steps[1].env?.IMAGE_DIGEST !== '$(imageDigest)' ||
    steps[1].env?.SOURCE_REF !== '$(Build.SourceBranch)' ||
    steps[1].env?.BUILD_COMMIT !== '$(Build.SourceVersion)'
  ) {
    throw Error('Deploy scan and update must use the same digest and source metadata');
  }
}

/** Applies repository delivery rules to supplied YAML and package scripts. */
export function lintRules(input: PipelineInput): Record<string, PipelineNode> {
  if (input.forbiddenPaths.length) throw Error(`Forbidden automation: ${input.forbiddenPaths.join(', ')}`);
  parseTrivyIgnore(input.ignore, input.today);
  const documents = Object.fromEntries(Object.entries(input.files).map(([path, source]) => [path, checkFile(path, source, input.scripts)]));
  checkTemplateReferences(documents);
  checkConnectionGates(documents);
  const pipeline = documents['azure-pipelines.yml'];
  const stages = pipeline?.stages?.map((stage: PipelineNode) => stage.stage);
  if (JSON.stringify(stages) !== JSON.stringify(expectedStages)) throw Error('Wrong pipeline stage order');
  if (pipeline.pr !== 'none' || JSON.stringify(pipeline.trigger) !== JSON.stringify({ branches: { include: ['main'] }, tags: { include: ['v*'] } })) {
    throw Error('Expected mirror main/tag triggers and pr: none');
  }
  checkDelivery(documents);
  checkStageTemplates(pipeline);
  checkJobCommands(documents);
  checkImageJobs(documents);
  checkSetup(documents['deploy/azure-devops/templates/setup-steps.yml']);
  checkSuites(documents, input.scripts);
  return documents;
}

/** Validates offline with the upstream draft-07 schema before applying repository rules. */
export function lintPipeline(input: PipelineInput, schema: object) {
  // Upstream patterns use legacy escapes that JavaScript rejects in Unicode mode.
  const ajv = new Ajv({
    strict: false,
    allErrors: false,
    validateFormats: false,
    unicodeRegExp: false,
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  for (const [path, source] of Object.entries(input.files)) {
    if (!validate(parse(source))) throw Error(`${path}: schema: ${ajv.errorsText(validate.errors)}`);
  }
  return lintRules(input);
}

/** Reads only delivery files and metadata; no remote schema resolution is used. */
export function readPipelineInput(): PipelineInput {
  const directory = 'deploy/azure-devops/templates';
  const paths = [
    'azure-pipelines.yml',
    ...readdirSync(directory)
      .filter(name => name.endsWith('.yml'))
      .map(name => `${directory}/${name}`),
  ];
  if (existsSync('azure-pipelines-rollback.yml')) paths.push('azure-pipelines-rollback.yml');
  return {
    files: Object.fromEntries(paths.map(path => [path, readFileSync(path, 'utf8')])),
    scripts: JSON.parse(readFileSync('package.json', 'utf8')).scripts,
    ignore: readFileSync('.trivyignore', 'utf8'),
    today: new Date().toISOString().slice(0, 10),
    forbiddenPaths: ['.github/workflows', '.github/dependabot.yml'].filter(existsSync),
  };
}

/** Reads and validates the non-secret dry-run parameter and variable fixture. */
export function readSampleVariables(): PipelineNode {
  const source = readFileSync('deploy/azure-devops/sample-variables.yml', 'utf8');
  if (/keycloak/i.test(source)) throw Error('Sample variables contain a Keycloak reference');
  const sample = parse(source);
  visitMappings(sample, checkSecurity);
  for (const name of targetVariables) {
    if (typeof sample.variables?.[name] !== 'string' || !sample.variables[name]) {
      throw Error(`Sample is missing ${name}`);
    }
  }
  return sample;
}

if (import.meta.main) {
  try {
    lintPipeline(readPipelineInput(), JSON.parse(readFileSync('deploy/azure-devops/schema/service-schema.json', 'utf8')));
    readSampleVariables();
    console.log('Pipeline schema and repository rules passed');
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
