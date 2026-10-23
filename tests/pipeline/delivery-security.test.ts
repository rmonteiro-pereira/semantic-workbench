// Covers the delivery hardening: ingress preflight, tag locking, the main-branch guard, service
// connection gating, production-only installs and the read-only container run.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { deploy, preflight } from '../../scripts/deploy';
import { appSettings, azureClient } from '../../scripts/deploy-azure';
import { fakeApp, fakeAzure, fakeRelease, fakeTarget } from '../../scripts/deploy-fake';
import { assertCommitOnMain, mainAncestryArguments } from '../../scripts/deploy-version';
import { lockArguments, pushCommitImage, registryTag, releaseTags } from '../../scripts/image';
import { hardenedRunArguments } from '../../scripts/container-hardening';
import { serverContainerArguments } from '../../scripts/auth-container-check';
import { buildPlan } from '../../scripts/pipeline-dry-run';
import { lintRules, readPipelineInput, readSampleVariables } from '../../scripts/pipeline-lint';

type App = ReturnType<typeof fakeApp>;
const writes = ['promote', 'lock', 'update', 'copy'];

const exposureChanges: [string, (app: App) => void][] = [
  ['ingress external', app => (app.ingress.external = false)],
  ['ingress HTTPS only', app => (app.ingress.allowInsecure = true)],
  ['ingress transport', app => (app.ingress.transport = 'tcp')],
  ['ingress CORS', app => (app.ingress.corsOrigins = ['https://other.example'])],
  ['ingress CORS', app => (app.ingress.corsOrigins = ['*'])],
  ['SW_PUBLIC_URL', app => (app.env.SW_PUBLIC_URL = 'https://other.example')],
  ['SW_PUBLIC_URL', app => delete app.env.SW_PUBLIC_URL],
];
describe('ingress preflight', () => {
  for (const [name, change] of exposureChanges) {
    test(`names ${name} and writes nothing`, async () => {
      const app = fakeApp();
      change(app);
      expect(() => preflight(app, fakeTarget)).toThrow(name);
      const client = fakeAzure();
      client.inspect = async () => app;
      await expect(deploy(fakeTarget, fakeRelease, client)).rejects.toThrow(name);
      expect(client.calls.some(call => writes.includes(call[0]))).toBe(false);
    });
  }

  test('accepts the public URL as the only CORS origin and any HTTP transport', () => {
    for (const transport of ['auto', 'http', 'http2']) {
      const app = fakeApp();
      app.ingress.transport = transport;
      app.ingress.corsOrigins = [fakeTarget.SW_PUBLIC_URL];
      expect(() => preflight(app, fakeTarget)).not.toThrow();
    }
  });

  test('the Azure response boundary reads exposure and fails closed when it is missing', () => {
    const response = (ingress: object | undefined) => {
      const app = fakeApp();
      return {
        identity: { userAssignedIdentities: { [app.identity]: {} } },
        properties: {
          configuration: { activeRevisionsMode: 'Single', ingress },
          template: { containers: [{ env: [] }], scale: {} },
        },
      };
    };
    const read = (ingress: object | undefined) =>
      appSettings(response(ingress), fakeTarget).ingress;
    expect(read({ external: true, allowInsecure: false, transport: 'Http2' })).toEqual({
      external: true,
      allowInsecure: false,
      transport: 'http2',
      corsOrigins: [],
    });
    expect(read({ allowInsecure: true }).allowInsecure).toBe(true);
    expect(read({}).allowInsecure).toBe(true);
    expect(read(undefined).external).toBe(false);
    expect(read({ corsPolicy: { allowedOrigins: ['https://a.example'] } }).corsOrigins).toEqual([
      'https://a.example',
    ]);
    expect(read({ corsPolicy: {} }).corsOrigins).toEqual(['*']);
    expect(read({ corsPolicy: null }).corsOrigins).toEqual([]);
  });
});

describe('tag locking', () => {
  test('both tags are locked after promotion and never after a failed smoke check', async () => {
    const client = fakeAzure();
    await deploy(fakeTarget, fakeRelease, client);
    expect(client.calls.slice(-2).map(call => call[0])).toEqual(['promote', 'lock']);
    expect(client.calls.at(-1)?.[1]).toEqual([`sha-${fakeRelease.commit}`, fakeRelease.tag]);
    const failing = fakeAzure({ failSmoke: true });
    await expect(deploy(fakeTarget, fakeRelease, failing)).rejects.toThrow('rolled back');
    expect(failing.calls.some(call => call[0] === 'lock')).toBe(false);
  });

  test('a failed lock fails the deployment after the promotion', async () => {
    const client = fakeAzure();
    client.lock = async () => {
      throw Error('lock refused');
    };
    await expect(deploy(fakeTarget, fakeRelease, client)).rejects.toThrow('lock refused');
    expect(client.calls.at(-1)?.[0]).toBe('promote');
  });

  test('the registry command makes exactly the named tag read-only', () => {
    expect(releaseTags(fakeRelease)).toEqual([`sha-${'a'.repeat(40)}`, 'v0.4.0-alpha.1']);
    const command = lockArguments(fakeTarget, 'v0.4.0');
    expect(command.slice(0, 4)).toEqual(['az', 'acr', 'repository', 'update']);
    expect(command).toContain('semantic-workbench:v0.4.0');
    expect(command.slice(-2)).toEqual(['--write-enabled', 'false']);
  });

  test('the Azure client locks the version tag and the commit tag', async () => {
    const calls: string[][] = [];
    const client = azureClient(fakeTarget, async args => {
      calls.push(args);
      return '';
    });
    await client.lock(fakeRelease);
    expect(calls).toEqual([
      lockArguments(fakeTarget, `sha-${fakeRelease.commit}`),
      lockArguments(fakeTarget, fakeRelease.tag),
    ]);
  });
});

describe('rerun after a half-finished lock', () => {
  test('the promotion is skipped and both tags are locked again', async () => {
    const lockCalls: string[] = [];
    let failVersionLock = true;
    let promoted = false;
    const command = async (args: string[]) => {
      if (args.includes('show-tags')) return '[]';
      if (args[0] === 'az' && args.includes('repository') && args.includes('show')) {
        if (!promoted) throw Error('MANIFEST_UNKNOWN: not found');
        return JSON.stringify({ digest: fakeRelease.digest, writeEnabled: true });
      }
      if (args.includes('create')) {
        promoted = true;
        return '';
      }
      if (args.includes('update') && args.includes('repository')) {
        const image = args[args.indexOf('--image') + 1];
        lockCalls.push(image);
        if (image.endsWith(fakeRelease.tag) && failVersionLock) throw Error('lock refused');
      }
      return '';
    };
    const client = azureClient(fakeTarget, command);
    await client.promote(fakeRelease);
    await expect(client.lock(fakeRelease)).rejects.toThrow('lock refused');
    expect(lockCalls).toEqual([
      `semantic-workbench:sha-${fakeRelease.commit}`,
      `semantic-workbench:${fakeRelease.tag}`,
    ]);
    failVersionLock = false;
    lockCalls.length = 0;
    const createsBefore = promoted;
    await client.promote(fakeRelease);
    await client.lock(fakeRelease);
    expect(createsBefore).toBe(true);
    expect(lockCalls).toHaveLength(2);
  });

  test('a version tag on another digest stops the promotion', async () => {
    const calls: string[][] = [];
    const client = azureClient(fakeTarget, async args => {
      calls.push(args);
      return JSON.stringify({ digest: `sha256:${'9'.repeat(64)}`, writeEnabled: true });
    });
    await expect(client.promote(fakeRelease)).rejects.toThrow('already points to another digest');
    expect(calls.some(args => args.includes('create'))).toBe(false);
  });
});

describe('commit tag push', () => {
  const commit = 'a'.repeat(40);
  const tag = `sha-${commit}`;
  const context = {
    engine: 'docker' as const,
    commit,
    version: '0.4.0',
    created: '2026-10-22T00:00:00Z',
    source: 'semantic-workbench',
  };
  const digest = `sha256:${'e'.repeat(64)}`;
  const other = `sha256:${'f'.repeat(64)}`;
  const original = { ...process.env };
  beforeEach(() => Object.assign(process.env, fakeTarget));
  afterEach(() => {
    for (const name of Object.keys(fakeTarget)) delete process.env[name];
    Object.assign(process.env, original);
  });

  type Registry = {
    tags: (() => string)[];
    labels?: Record<string, string>;
    pushOutput?: string;
  };
  const goodLabels = {
    'org.opencontainers.image.revision': commit,
    'org.opencontainers.image.version': '0.4.0',
  };
  const tagJson = (value: string, writeEnabled: boolean) =>
    JSON.stringify({ digest: value, writeEnabled });
  function runner(registry: Registry) {
    const calls: string[][] = [];
    let reads = 0;
    const run = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'az' && args.includes('show')) return registry.tags[reads++]();
      if (args.includes('inspect')) return JSON.stringify({ config: { Labels: registry.labels } });
      if (args.includes('push')) return registry.pushOutput ?? `latest: digest: ${digest} size: 1`;
      return '';
    };
    return { calls, run };
  }
  const notFound = () => {
    throw Error('az acr exited 1: MANIFEST_UNKNOWN: manifest not found');
  };
  const has = (calls: string[][], word: string) => calls.filter(args => args.includes(word));
  const push = (run: (args: string[]) => Promise<string>) =>
    pushCommitImage(context, 'swfake.azurecr.io', fakeTarget, run);

  test('a locked tag with matching labels is kept and nothing is pushed', async () => {
    const { calls, run } = runner({ tags: [() => tagJson(digest, false)], labels: goodLabels });
    expect(await push(run)).toEqual({ digest, kept: true });
    expect(has(calls, 'push')).toEqual([]);
    expect(has(calls, 'update')).toEqual([]);
  });

  test('an unlocked existing tag is refused', async () => {
    const { calls, run } = runner({ tags: [() => tagJson(digest, true)], labels: goodLabels });
    await expect(push(run)).rejects.toThrow('not locked');
    expect(has(calls, 'push')).toEqual([]);
  });

  test('a kept tag whose labels name another commit or version is refused', async () => {
    for (const labels of [
      { ...goodLabels, 'org.opencontainers.image.revision': 'b'.repeat(40) },
      { ...goodLabels, 'org.opencontainers.image.version': '0.3.0' },
      undefined,
    ]) {
      const { run } = runner({ tags: [() => tagJson(digest, false)], labels });
      await expect(push(run)).rejects.toThrow('Existing image is labelled');
    }
  });

  test('a new tag is pushed, locked at once and read back', async () => {
    const { calls, run } = runner({
      tags: [notFound, () => tagJson(digest, false)],
    });
    expect(await push(run)).toEqual({ digest, kept: false });
    const order = calls.map(args => (args.includes('push') ? 'push' : args[2]));
    expect(order.indexOf('push')).toBeLessThan(order.indexOf('repository', order.indexOf('push')));
    expect(has(calls, 'update')).toEqual([lockArguments(fakeTarget, tag)]);
  });

  test('a tag that points elsewhere after the push fails the run', async () => {
    const { run } = runner({ tags: [notFound, () => tagJson(other, false)] });
    await expect(push(run)).rejects.toThrow('does not point to the pushed digest');
    const missing = runner({ tags: [notFound, notFound] });
    await expect(push(missing.run)).rejects.toThrow('does not point to the pushed digest');
  });

  test('a push that reports no digest fails the run', async () => {
    const { run } = runner({ tags: [notFound], pushOutput: 'done' });
    await expect(push(run)).rejects.toThrow('did not report an image digest');
  });

  test('a registry that does not exist yet counts as having no tag', async () => {
    const run = async () => {
      throw Error('az acr exited 1: NAME_UNKNOWN: repository name not known to registry');
    };
    expect(await registryTag('swfake', tag, run)).toBeNull();
  });

  test('other lookup failures and malformed answers stop the push', async () => {
    const denied = runner({
      tags: [
        () => {
          throw Error('az acr exited 1: AuthorizationFailed');
        },
      ],
    });
    await expect(push(denied.run)).rejects.toThrow('AuthorizationFailed');
    expect(has(denied.calls, 'push')).toEqual([]);
    const garbage = runner({ tags: [() => '{}'] });
    await expect(push(garbage.run)).rejects.toThrow('Invalid registry response');
    expect(has(garbage.calls, 'push')).toEqual([]);
  });
});

describe('release commit on main', () => {
  let repository = '';
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(['git', '-C', repository, ...args], {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Tester',
        GIT_AUTHOR_EMAIL: 'tester@example.invalid',
        GIT_COMMITTER_NAME: 'Tester',
        GIT_COMMITTER_EMAIL: 'tester@example.invalid',
      },
    });
    expect(result.exitCode).toBe(0);
    return result.stdout.toString().trim();
  };
  const commitFile = (name: string) => {
    writeFileSync(join(repository, name), name);
    git('add', name);
    git('commit', '-q', '-m', name);
    return git('rev-parse', 'HEAD');
  };
  beforeEach(() => {
    repository = mkdtempSync(join(tmpdir(), 'sw-main-ancestry-'));
    git('init', '-q', '-b', 'main');
  });
  afterEach(() => rmSync(repository, { recursive: true, force: true }));

  test('accepts a commit that main contains and refuses one it does not', async () => {
    const reviewed = commitFile('reviewed');
    git('update-ref', 'refs/remotes/origin/main', reviewed);
    git('checkout', '-q', '-b', 'unreviewed');
    const unreviewed = commitFile('unreviewed');
    await expect(assertCommitOnMain(reviewed, repository)).resolves.toBeUndefined();
    await expect(assertCommitOnMain(unreviewed, repository)).rejects.toThrow(
      'is not on origin/main',
    );
  });

  test('fails closed when origin/main cannot be compared', async () => {
    const head = commitFile('only');
    await expect(assertCommitOnMain(head, repository)).rejects.toThrow('Could not compare');
  });

  test('the check script refuses an unreviewed tag before it reads the registry', () => {
    const reviewed = commitFile('reviewed');
    git('update-ref', 'refs/remotes/origin/main', reviewed);
    git('checkout', '-q', '-b', 'unreviewed');
    const unreviewed = commitFile('unreviewed');
    writeFileSync(join(repository, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    const result = Bun.spawnSync(
      [process.execPath, join(process.cwd(), 'scripts/deploy-version.ts')],
      {
        cwd: repository,
        env: {
          ...process.env,
          ...fakeTarget,
          SOURCE_REF: 'refs/tags/v0.4.0',
          SOURCE_VERSION: unreviewed,
        },
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('is not on origin/main');
  });

  test('only a full commit id reaches Git', () => {
    expect(mainAncestryArguments('a'.repeat(40))).toEqual([
      'git',
      'merge-base',
      '--is-ancestor',
      'a'.repeat(40),
      'origin/main',
    ]);
    for (const value of ['HEAD', '--all', 'abc', `${'a'.repeat(40)}; id`]) {
      expect(() => mainAncestryArguments(value)).toThrow('40-hex');
    }
  });
});

describe('service connection gates', () => {
  const imageJobs = 'deploy/azure-devops/templates/image-jobs.yml';
  const mainPipeline = 'azure-pipelines.yml';
  const edit = (file: string, before: string, after: string) => {
    const input = readPipelineInput();
    expect(input.files[file]).toContain(before);
    input.files[file] = input.files[file].replace(before, after);
    return input;
  };

  test('the delivered files pass every gate', () => {
    expect(() => lintRules(readPipelineInput())).not.toThrow();
  });

  const extraStep = (condition: string) => `      - task: AzureCLI@2
        condition: ${condition}
        inputs:
          azureSubscription: \${{ parameters.acrServiceConnection }}
          scriptType: bash
          scriptLocation: inlineScript
          inlineScript: bun run check
      - task: PublishPipelineArtifact@1`;
  const publish = '      - task: PublishPipelineArtifact@1';

  test('an ungated extra step with the push connection in Image is refused', () => {
    const input = edit(imageJobs, publish, extraStep('always()'));
    expect(() => lintRules(input)).toThrow('main or tags only');
  });

  test('a second gated connection step in Image is still refused', () => {
    const gate = "and(succeeded(), startsWith(variables['Build.SourceBranch'], 'refs/tags/v'))";
    const input = edit(imageJobs, publish, extraStep(gate));
    expect(() => lintRules(input)).toThrow('exactly one AzureCLI step');
  });

  test('a push step whose condition is widened is refused', () => {
    const input = edit(
      imageJobs,
      `condition: >-
          and(succeeded(), or(eq(variables['Build.SourceBranch'], 'refs/heads/main'),
          startsWith(variables['Build.SourceBranch'], 'refs/tags/v')))`,
      'condition: succeeded()',
    );
    expect(() => lintRules(input)).toThrow('main or tags only');
  });

  test('a service connection in a file outside the allowed set is refused', () => {
    const input = readPipelineInput();
    input.files['deploy/azure-devops/templates/extra.yml'] = stringify({
      steps: [
        {
          task: 'AzureCLI@2',
          inputs: {
            azureSubscription: '${{ parameters.acrServiceConnection }}',
            scriptType: 'bash',
            scriptLocation: 'inlineScript',
            inlineScript: 'bun run check',
          },
        },
      ],
    });
    expect(() => lintRules(input)).toThrow('service connection outside');
  });

  test('a service connection in an ordinary job of a pipeline file is refused', () => {
    const rollback = 'azure-pipelines-rollback.yml';
    const anchor = '                    ROLLBACK_TARGET: ${{ parameters.target }}\n';
    const input = edit(
      rollback,
      anchor,
      `${anchor}      - job: extra
        steps:
          - task: AzureCLI@2
            inputs:
              azureSubscription: \${{ parameters.deployServiceConnection }}
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: bun run check
`,
    );
    expect(() => lintRules(input)).toThrow('service connection outside a deployment');
  });

  test('the tag check must use the pull connection, not the push connection', () => {
    const input = edit(
      imageJobs,
      'azureSubscription: ${{ parameters.acrPullServiceConnection }}',
      'azureSubscription: ${{ parameters.acrServiceConnection }}',
    );
    expect(() => lintRules(input)).toThrow('pull connection');
  });

  test('the push step must use the push connection', () => {
    const input = readPipelineInput();
    const document = parse(input.files[imageJobs]);
    document.jobs[1].steps.find(
      (step: any) => step.task === 'AzureCLI@2',
    ).inputs.azureSubscription = '${{ parameters.acrPullServiceConnection }}';
    input.files[imageJobs] = stringify(document);
    expect(() => lintRules(input)).toThrow('main/tag-only push');
  });

  test('the tag check needs the full history to compare with main', () => {
    const input = edit(imageJobs, 'fetchDepth: 0', 'fetchDepth: 1');
    expect(() => lintRules(input)).toThrow('full history');
  });

  test('the check job passes the tagged commit to the script', () => {
    const input = edit(imageJobs, 'SOURCE_VERSION: $(Build.SourceVersion)', 'OTHER: value');
    expect(() => lintRules(input)).toThrow('Tag check');
  });

  test('the pull connection needs its own parameter and default', () => {
    const input = edit(mainPipeline, 'default: sw-azure-pull', 'default: sw-azure-push');
    expect(() => lintRules(input)).toThrow('acrPullServiceConnection');
  });

  test('deployment and rollback install production dependencies only', () => {
    for (const file of [mainPipeline, 'azure-pipelines-rollback.yml']) {
      const input = edit(file, 'production: true', 'production: false');
      expect(() => lintRules(input)).toThrow('production dependencies only');
    }
    const setup = 'deploy/azure-devops/templates/setup-steps.yml';
    const input = edit(setup, 'bun install --frozen-lockfile --production', 'bun install');
    expect(() => lintRules(input)).toThrow('Setup must use pinned Bun');
  });
});

describe('dry-run plan', () => {
  const plan = (run: string) =>
    buildPlan(lintRules(readPipelineInput()), readSampleVariables(), run);

  test('a pull-request run enables no step with a service connection', () => {
    const steps = plan('pr');
    expect(steps.filter(step => step.kind === 'azure' && step.enabled)).toEqual([]);
    expect(steps.some(step => step.kind === 'azure')).toBe(true);
  });

  test('a changed condition that lets a pull request reach a connection fails the plan', () => {
    const documents = lintRules(readPipelineInput());
    const jobs = documents['deploy/azure-devops/templates/image-jobs.yml'].jobs;
    jobs[0].condition = 'succeeded()';
    expect(() => buildPlan(documents, readSampleVariables(), 'pr')).toThrow(
      'Pull-request runs must not use a service connection',
    );
  });

  test('the tag check uses the pull connection, the tagged commit and full history', () => {
    const steps = plan('tag:v0.4.0');
    const check = steps.find(step => step.job === 'check' && step.kind === 'azure')!;
    expect(check.serviceConnection).toBe('sw-azure-pull');
    expect(check.env?.SOURCE_VERSION).toBe('a'.repeat(40));
    const checkout = steps.find(step => step.job === 'check' && step.kind === 'setup')!;
    expect(checkout.command).toBe('checkout: self (fetchDepth: 0)');
    expect(
      steps.find(step => step.job === 'push' || step.command.includes('image:push'))
        ?.serviceConnection,
    ).toBe('sw-azure-push');
  });

  test('delivery installs production dependencies and validation installs everything', () => {
    const steps = plan('tag:v0.4.0');
    const installs = (stage: string, flag: string) =>
      steps.filter(
        step => step.stage === stage && step.command === `bun install --frozen-lockfile${flag}`,
      );
    expect(installs('Deploy', ' --production').every(step => step.enabled)).toBe(true);
    expect(installs('Deploy', '').every(step => !step.enabled)).toBe(true);
    expect(installs('Validate', '').every(step => step.enabled)).toBe(true);
    expect(installs('Validate', ' --production').every(step => !step.enabled)).toBe(true);
    const rollback = buildPlan(
      lintRules(readPipelineInput()),
      readSampleVariables(),
      'tag:v0.4.0',
      'rollback',
    );
    expect(
      rollback.find(step => step.command === 'bun install --frozen-lockfile --production')?.enabled,
    ).toBe(true);
    expect(rollback.find(step => step.command === 'bun install --frozen-lockfile')?.enabled).toBe(
      false,
    );
  });
});

describe('deployment roles and documents', () => {
  const role = (name: string) => JSON.parse(readFileSync(`deploy/${name}`, 'utf8'));

  test('the container app deployer role cannot read secrets or open a shell', () => {
    const deployer = role('container-app-deployer-role.json');
    expect(deployer.Actions).toEqual([
      'Microsoft.App/containerApps/read',
      'Microsoft.App/containerApps/write',
      'Microsoft.App/containerApps/revisions/*',
      'Microsoft.App/locations/containerappOperationStatuses/read',
      'Microsoft.App/locations/containerappOperationResults/read',
    ]);
    expect(deployer.DataActions).toEqual([]);
    expect(deployer.Actions.filter((action: string) => action.endsWith('*'))).toEqual([
      'Microsoft.App/containerApps/revisions/*',
    ]);
    expect(JSON.stringify(deployer.Actions)).not.toMatch(/listSecrets|getAuthToken|exec/);
    expect(JSON.stringify(deployer)).not.toContain('operationResults/read"');
    expect(deployer.AssignableScopes).toEqual([
      '/subscriptions/<subscription-id>/resourceGroups/<resource-group>',
    ]);
  });

  test('the registry tag lock role grants metadata access and no push, pull or delete', () => {
    const locker = role('registry-tag-lock-role.json');
    expect(locker.Actions.sort()).toEqual([
      'Microsoft.ContainerRegistry/registries/metadata/read',
      'Microsoft.ContainerRegistry/registries/metadata/write',
    ]);
    expect(locker.DataActions).toEqual([]);
    expect(locker.AssignableScopes).toEqual([
      '/subscriptions/<subscription-id>/resourceGroups/<resource-group>',
    ]);
  });

  test('the setup guide makes branch control mandatory and limits tag creation', () => {
    const guide = readFileSync('deploy/README.md', 'utf8');
    expect(guide).toContain('**Branch control on the three service connections is mandatory.**');
    expect(guide).toContain('Verify branch protection');
    expect(guide).toContain('| `sw-azure-deploy` | `refs/tags/v*` | off |');
    expect(guide).toContain('| `sw-azure-push` | `refs/heads/main`, `refs/tags/v*` | on |');
    expect(guide).toContain('| `sw-azure-pull` | `refs/tags/v*` | off |');
    expect(guide).toContain('Tags have no branch policies');
    expect(guide).toContain('DataActions');
    expect(guide).toContain('keeps the tag only if it is locked');
    expect(guide).toContain('run the pipeline again on the same tag');
    expect(guide).toContain(
      '**Create tag** for the path\n   `refs/tags/v*` to Allow for the release operator only',
    );
    expect(guide).toContain('check\n   that it is the commit of the merged pull request on `main`');
    expect(guide).toContain('Do not grant **Contributor** on the\n   container app');
    expect(guide).toContain('External HTTPS only');
    expect(guide).not.toContain('Service connections may also have branch control');
  });

  test('the Log Analytics key is read by command, never typed', () => {
    const guide = readFileSync('deploy/README.md', 'utf8');
    expect(guide).toContain(
      '--logs-workspace-key "$(az monitor log-analytics workspace get-shared-keys',
    );
    expect(guide).toContain('--query primarySharedKey');
    expect(guide).not.toContain('<workspace-key>');
  });

  test('the trial report keeps raw output, tokens and names out of the public repository', () => {
    const runbook = readFileSync('deploy/trial-runbook.md', 'utf8');
    for (const phrase of [
      'tokens and cookie values',
      '`Set-Cookie`',
      'agent-client.ts',
      'object IDs',
      'names of approvers',
    ]) {
      expect(runbook).toContain(phrase);
    }
    expect(runbook).not.toContain('<observed output or error>');
    expect(runbook).toContain('Step 9: pass | fail — <names of the failed checks, no raw output>');
    expect(runbook).toContain('Verify branch protection');
    expect(runbook).toContain('az provider operation show --namespace');
    expect(runbook).toContain('revision copy');
    expect(runbook).toContain('Step 10: pass | fail');
    expect(runbook).toContain('10. **Branch control without branch protection.**');
    expect(runbook).toContain('container-app-deployer-role.json');
  });

  test('the contract records the same rules', () => {
    const contract = readFileSync('specs/003-authn-authz/contracts/delivery-pipeline.md', 'utf8');
    for (const phrase of [
      'Verify branch protection',
      'git merge-base --is-ancestor',
      'acrPullServiceConnection',
      '--write-enabled false',
      'container-app-deployer-role.json',
      '`allowInsecure` false',
      '--production',
    ]) {
      expect(contract).toContain(phrase);
    }
  });
});

describe('read-only container run', () => {
  test('the shared flags drop every capability and leave only /tmp writable', () => {
    expect(hardenedRunArguments()).toEqual([
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
    ]);
  });

  test('the server container of the authentication check uses them', () => {
    for (const engine of ['docker', 'podman'] as const) {
      const args = serverContainerArguments(
        engine,
        { image: 'image', name: 'name', root: '/tmp/root' },
        {},
      );
      expect(args.join(' ')).toContain(hardenedRunArguments().join(' '));
    }
  });

  test('both Compose services that run the image set the same restrictions', () => {
    const services = parse(readFileSync('compose.yaml', 'utf8')).services;
    for (const name of ['workbench', 'workbench-server']) {
      const service = services[name];
      expect(service.read_only).toBe(true);
      expect(service.tmpfs).toEqual(['/tmp']);
      expect(service.cap_drop).toEqual(['ALL']);
      expect(service.security_opt).toEqual(['no-new-privileges:true']);
    }
  });
});
