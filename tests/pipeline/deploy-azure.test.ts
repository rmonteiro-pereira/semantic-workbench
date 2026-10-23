import { expect, spyOn, test } from 'bun:test';
import { appSettings, azureClient } from '../../scripts/deploy-azure';
import { deploy } from '../../scripts/deploy';
import { fakeApp, fakeRelease, fakeTarget } from '../../scripts/deploy-fake';

function azureApp() {
  const app = fakeApp();
  return {
    identity: { userAssignedIdentities: { [app.identity]: {} } },
    properties: {
      configuration: {
        activeRevisionsMode: 'Single',
        ingress: { targetPort: 4310, external: true, allowInsecure: false, transport: 'Auto' },
        registries: [{ server: 'swfake.azurecr.io', identity: app.identity }],
        secrets: app.secrets.map(secret => ({
          name: secret.name,
          keyVaultUrl: secret.url,
          identity: secret.identity,
        })),
      },
      template: {
        scale: { minReplicas: 1, maxReplicas: 1 },
        volumes: [{ name: 'workspace', storageType: 'AzureFile' }],
        containers: [
          {
            volumeMounts: [{ mountPath: '/data', volumeName: 'workspace' }],
            env: Object.entries(app.env).map(([name, value]) =>
              value.startsWith('secretref:')
                ? { name, secretRef: value.slice(10) }
                : { name, value },
            ),
          },
        ],
      },
    },
  };
}

test('Azure response boundary resolves mounts, references and identities', () => {
  expect(appSettings(azureApp(), fakeTarget)).toEqual(fakeApp());
  const missingVolume = azureApp();
  missingVolume.properties.template.volumes = [];
  expect(appSettings(missingVolume, fakeTarget).volume).toBe(false);
  expect(() => appSettings({}, fakeTarget)).toThrow('properties');
});

test('CLI adapter promotes recorded digest and isolates registry authentication', async () => {
  const calls: string[][] = [];
  const credentialDirectories: string[] = [];
  const command = async (args: string[], _capture = false, env = process.env) => {
    calls.push(args);
    if (args[0] === 'docker') {
      credentialDirectories.push(env.DOCKER_CONFIG!);
      if (args.includes('inspect'))
        return JSON.stringify({
          config: {
            Labels: {
              'org.opencontainers.image.version': '0.3.0',
              'org.opencontainers.image.revision': 'c'.repeat(40),
            },
          },
        });
      return '';
    }
    if (args.includes('show-tags')) return '[]';
    if (args.includes('repository') && args.includes('show'))
      throw Error('MANIFEST_UNKNOWN: not found');
    if (args.includes('login')) return '';
    if (args.includes('list'))
      return JSON.stringify([
        {
          name: 'before',
          properties: {
            active: true,
            template: {
              containers: [
                {
                  image: `swfake.azurecr.io/semantic-workbench@sha256:${'d'.repeat(64)}`,
                },
              ],
            },
          },
        },
      ]);
    if (args.includes('update'))
      return JSON.stringify({ properties: { latestRevisionName: 'after' } });
    if (args.includes('revision'))
      return JSON.stringify({
        properties: {
          runningState: 'Running',
          healthState: 'Healthy',
        },
      });
    return JSON.stringify(azureApp());
  };
  const client = azureClient(fakeTarget, command);
  client.smoke = async revision => {
    expect(revision.commit).toBe(fakeRelease.commit);
  };
  await deploy(fakeTarget, fakeRelease, client);
  const promotion = calls.find(args => args.includes('create'))!;
  expect(promotion).toContain(`swfake.azurecr.io/semantic-workbench@${fakeRelease.digest}`);
  const update = calls.find(args => args.includes('update'))!;
  expect(update).toContain(`swfake.azurecr.io/semantic-workbench@${fakeRelease.digest}`);
  expect(calls.findIndex(args => args.includes('show-tags'))).toBeLessThan(
    calls.findIndex(args => args.includes('create')),
  );
  expect(
    credentialDirectories.every(directory => directory.startsWith('/tmp/sw-deploy-registry-')),
  ).toBe(true);
  for (const directory of credentialDirectories) {
    expect(await Bun.file(`${directory}/config.json`).exists()).toBe(false);
  }
});

function restoredRegistry() {
  const repository = 'swfake.azurecr.io/semantic-workbench';
  const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
  const revisions = [
    { name: 'restored-v1', version: '1.0.0', digest: digest('b'), active: true },
    { name: 'failed-v2', version: '2.0.0', digest: digest('c'), active: false },
    { name: 'original-v1', version: '1.0.0', digest: digest('b'), active: false },
  ];
  const tags: Record<string, string> = {
    'v0.7.0': digest('e'),
    'v0.8.0': digest('a'),
    'v0.9.0': digest('c'),
    'v0.9.1': digest('b'),
    'v1.0.0': digest('b'),
  };
  const calls: string[][] = [];
  const command = async (args: string[]) => {
    calls.push(args);
    if (args.includes('list')) {
      expect(args).toContain('--all');
      return JSON.stringify(
        revisions.map((revision, index) => ({
          name: revision.name,
          properties: {
            active: revision.active,
            createdTime: `2026-10-${22 - index}`,
            runningState: revision.name === 'failed-v2' ? 'Failed' : 'Running',
            template: { containers: [{ image: `${repository}@${revision.digest}` }] },
          },
        })),
      );
    }
    if (args.includes('show-tags')) return JSON.stringify(Object.keys(tags));
    if (args.includes('--image')) {
      const tag = args[args.indexOf('--image') + 1].split(':')[1];
      return JSON.stringify({ digest: tags[tag] });
    }
    if (args.includes('inspect')) {
      const image = args[args.indexOf('inspect') + 1];
      return JSON.stringify({
        config: {
          Labels: {
            'org.opencontainers.image.version': image.endsWith(digest('b')) ? '1.0.0' : '0.8.0',
            'org.opencontainers.image.revision': 'a'.repeat(40),
          },
        },
      });
    }
    return '';
  };
  return { command, calls, digest };
}

test('previous ignores restored creation order, active aliases and failed digests', async () => {
  const fixture = restoredRegistry();
  const previous = await azureClient(fakeTarget, fixture.command).previous();
  expect(previous.name).toBe('v0.8.0');
  expect(previous.digest).toBe(fixture.digest('a'));
  const query = fixture.calls.find(args => args.includes('show-tags'))!;
  expect(query.filter(arg => ['--output', '-o'].includes(arg))).toEqual(['--output']);
  expect(query).toContain('--subscription');
});

test('rollback scanner delegates to the image scanner with the resolved digest and target', async () => {
  const calls: string[][] = [];
  const client = azureClient(fakeTarget, async (args, _capture, env) => {
    calls.push(args);
    expect(env?.ENTRA_TENANT_ID).toBe(fakeTarget.ENTRA_TENANT_ID);
    return '';
  });
  await client.scan(fakeRelease.digest);
  expect(calls).toEqual([
    [
      'bun',
      'scripts/image.ts',
      'scan',
      '--ref',
      `swfake.azurecr.io/semantic-workbench@${fakeRelease.digest}`,
    ],
  ]);
});

test('smoke uses target discovery without trusting or reading app issuer settings', async () => {
  const urls: string[] = [];
  const request = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        urls.push(String(input));
        if (urls.length === 1) return Response.json({ ready: true, state: 'serving' });
        throw Error('offline discovery reached');
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const client = azureClient(fakeTarget, async () => {
      throw Error('unexpected app query');
    });
    await expect(client.smoke({ ...fakeRelease, name: 'active' })).rejects.toThrow(
      'offline discovery reached',
    );
    expect(urls).toEqual([
      'https://workbench.example/readyz',
      'https://login.microsoftonline.com/tenant/v2.0/.well-known/openid-configuration',
    ]);
  } finally {
    request.mockRestore();
  }
});
