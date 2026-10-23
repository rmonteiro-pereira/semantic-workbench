import { expect, test } from 'bun:test';
import {
  deploy,
  rollback,
  preflight,
  deploymentFailure,
  targetIssuer,
  previousPromotion,
} from '../../scripts/deploy';
import { promotionArguments, validateTarget } from '../../scripts/image';
import { fakeAzure, fakeTarget, fakeApp, fakeRelease } from '../../scripts/deploy-fake';

for (const [version, tags] of [
  ['0.5.0', []],
  ['0.4.0', ['v0.5.0']],
] as const) {
  test(`version guard refuses ${version} / ${tags} before writes`, async () => {
    const client = fakeAzure({ tags: [...tags] });
    await expect(
      deploy(fakeTarget, { ...fakeRelease, packageVersion: version }, client),
    ).rejects.toThrow();
    expect(client.calls.every(call => !['promote', 'update', 'copy'].includes(call[0]))).toBe(true);
  });
}

test('missing target values fail before any client call', async () => {
  const client = fakeAzure();
  expect(() => validateTarget({})).toThrow('ACR_NAME');
  expect(client.calls).toEqual([]);
});

const wrongSettings: [string, (app: ReturnType<typeof fakeApp>) => void][] = [
  [
    'revision mode',
    app => {
      app.mode = 'Multiple';
    },
  ],
  [
    'replicas',
    app => {
      app.maxReplicas = 2;
    },
  ],
  [
    'replicas',
    app => {
      app.minReplicas = 0;
    },
  ],
  [
    'volume',
    app => {
      app.volume = false;
    },
  ],
  [
    'identity',
    app => {
      app.identity = '';
    },
  ],
  [
    'registry identity',
    app => {
      app.registryIdentity = '';
    },
  ],
  [
    'SW_MODE',
    app => {
      app.env.SW_MODE = 'local';
    },
  ],
  [
    'SW_HOST',
    app => {
      app.env.SW_HOST = '127.0.0.1';
    },
  ],
  [
    'port',
    app => {
      app.port = 80;
    },
  ],
  [
    'Key Vault',
    app => {
      app.secrets = [];
    },
  ],
  [
    'SW_OIDC_CLIENT_ID',
    app => {
      app.env.SW_OIDC_CLIENT_ID = 'other';
    },
  ],
  [
    'SW_ENTRA_TENANT_ID',
    app => {
      app.env.SW_ENTRA_TENANT_ID = 'other';
    },
  ],
];
for (const [setting, change] of wrongSettings) {
  test(`preflight names incorrect ${setting}`, () => {
    const app = fakeApp();
    change(app);
    expect(() => preflight(app, fakeTarget)).toThrow(setting);
  });
}

test('smoke passes before promotion and updates the scanned digest', async () => {
  const client = fakeAzure();
  await deploy(fakeTarget, fakeRelease, client);
  expect(client.calls.map(call => call[0])).toEqual([
    'tags',
    'inspect',
    'active',
    'update',
    'wait',
    'smoke',
    'promote',
  ]);
  expect(client.calls[3][1]).toBe(fakeRelease.digest);
  const command = promotionArguments(fakeTarget, fakeRelease);
  expect(command.slice(0, 4)).toEqual(['docker', 'buildx', 'imagetools', 'create']);
  expect(command).toContain('--prefer-index=false');
  expect(command.at(-1)).toEndWith(`@${fakeRelease.digest}`);
});

test('failed smoke copies recorded revision, checks restored labels and still fails', async () => {
  const client = fakeAzure({ failSmoke: true });
  await expect(deploy(fakeTarget, fakeRelease, client)).rejects.toThrow('rolled back');
  expect(client.calls.slice(-3).map(call => call[0])).toEqual(['copy', 'wait', 'smoke']);
  expect(client.calls.at(-3)?.[1]).toBe('previous');
  expect(client.calls.some(call => call[0] === 'promote')).toBe(false);
  expect(client.calls.at(-1)?.[1]).toEqual(client.recorded);
});

for (const target of ['previous', 'tag']) {
  test(`manual rollback resolves ${target} and refuses branch refs`, async () => {
    const client = fakeAzure();
    await expect(rollback(fakeTarget, target, 'refs/heads/main', client)).rejects.toThrow(
      'tag ref',
    );
    expect(client.calls).toEqual([]);
    await rollback(fakeTarget, target, 'refs/tags/v0.4.0-alpha.1', client);
    expect(client.calls.some(call => call[0] === 'promote')).toBe(false);
    expect(client.calls.at(-1)?.[0]).toBe('smoke');
  });
}

for (const [setting, change] of wrongSettings) {
  test(`failed ${setting} preflight makes no Azure write`, async () => {
    const client = fakeAzure();
    const app = fakeApp();
    change(app);
    client.inspect = async () => app;
    await expect(deploy(fakeTarget, fakeRelease, client)).rejects.toThrow(setting);
    expect(client.calls.every(call => !['promote', 'update', 'copy'].includes(call[0]))).toBe(true);
  });
}

test('failed restoration reports both deployment and recovery errors', async () => {
  const client = fakeAzure({ failSmoke: true });
  client.copy = async () => {
    throw Error('copy unavailable');
  };
  await expect(deploy(fakeTarget, fakeRelease, client)).rejects.toThrow(
    'Deployment and rollback failed',
  );
});

test('fake CLI works offline and injected smoke failure exits nonzero after recovery', () => {
  const command = [process.execPath, 'scripts/deploy.ts', 'deploy', '--fake'];
  const env = { ...process.env, ...fakeTarget };
  const success = Bun.spawnSync(command, { env });
  expect(success.exitCode).toBe(0);
  const failure = Bun.spawnSync([...command, '--fail-smoke'], { env });
  expect(failure.exitCode).toBe(1);
  expect(failure.stdout.toString()).toContain('"restored":"restored"');
});

test('issuer comes from the target and preflight names a wrong issuer', () => {
  const app = fakeApp();
  app.env.SW_OIDC_ISSUER = 'https://attacker.example';
  expect(() => preflight(app, fakeTarget)).toThrow('SW_OIDC_ISSUER');
  expect(targetIssuer(fakeTarget)).toBe('https://login.microsoftonline.com/tenant/v2.0');
});

test('tag rollback verifies commit identity, scans, then updates with recovery', async () => {
  const client = fakeAzure({ failSmoke: true });
  await expect(rollback(fakeTarget, 'tag', 'refs/tags/v0.4.0', client)).rejects.toThrow(
    'rolled back',
  );
  expect(client.calls.map(call => call[0])).toEqual([
    'inspect',
    'resolve',
    'resolve',
    'scan',
    'active',
    'update',
    'wait',
    'smoke',
    'copy',
    'wait',
    'smoke',
  ]);
});

test('mutable tag mismatch and failed rescan prevent updates', async () => {
  const client = fakeAzure();
  client.resolve = async tag => ({
    ...fakeRelease,
    name: tag,
    digest: tag.startsWith('sha-') ? 'different' : fakeRelease.digest,
  });
  await expect(rollback(fakeTarget, 'tag', 'refs/tags/v0.4.0', client)).rejects.toThrow(
    'digest differs',
  );
  expect(client.calls.some(call => call[0] === 'update')).toBe(false);
  const scanning = fakeAzure();
  scanning.scan = async () => {
    throw Error('scan failed');
  };
  await expect(rollback(fakeTarget, 'tag', 'refs/tags/v0.4.0', scanning)).rejects.toThrow(
    'scan failed',
  );
  expect(scanning.calls.some(call => call[0] === 'update')).toBe(false);
});

test('structured diagnostics preserve aggregate errors and nested causes', () => {
  const failure = deploymentFailure(
    new AggregateError(
      [new Error('update', { cause: Error('network') }), Error('restore')],
      'both failed',
    ),
  );
  expect(JSON.stringify(failure)).toContain('network');
  expect(JSON.stringify(failure)).toContain('restore');
  const result = Bun.spawnSync(
    [process.execPath, 'scripts/deploy.ts', 'deploy', '--fake', '--fail-smoke'],
    { env: { ...process.env, ...fakeTarget } },
  );
  expect(JSON.parse(result.stderr.toString())).toMatchObject({
    ok: false,
    cause: { error: 'Injected smoke failure' },
    errors: [],
  });
});

test('previous refuses when no older successful promoted digest exists', () => {
  const revision = { ...fakeRelease, name: 'active' };
  expect(() => previousPromotion(revision, [{ tag: 'v0.4.0', revision }], new Set())).toThrow(
    'No previous promoted',
  );
});

test('validated target has all required fields and discards unrelated environment values', () => {
  expect(validateTarget({ ...fakeTarget, UNRELATED_SECRET: 'not a target setting' })).toEqual(
    fakeTarget,
  );
});

test('rollback update failure restores the recorded revision', async () => {
  const client = fakeAzure();
  client.update = async () => {
    throw Error('update failed');
  };
  await expect(rollback(fakeTarget, 'tag', 'refs/tags/v0.4.0', client)).rejects.toThrow(
    'rolled back',
  );
  expect(client.calls.slice(-3).map(call => call[0])).toEqual(['copy', 'wait', 'smoke']);
});

test('production CLI validates its target without loading fake fixtures', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const directory = await mkdtemp('/tmp/sw-deploy-import-');
  const preload = `${directory}/preload.ts`;
  await Bun.write(
    preload,
    `
    Bun.plugin({
      name: 'refuse-fake-fixtures',
      setup(build) {
        build.onLoad({ filter: /deploy-fake/ }, () => {
          throw Error('Production loaded fake fixtures');
        });
      },
    });
  `,
  );
  try {
    const result = Bun.spawnSync(
      [process.execPath, '--preload', preload, 'scripts/deploy.ts', 'deploy'],
      { env: {} },
    );
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr.toString()).error).toContain('Missing target variables');
    expect(result.stderr.toString()).not.toContain('Production loaded fake fixtures');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preflight requires the Entra certificate key to be a Key Vault reference', () => {
  const app = fakeApp();
  const vault = 'https://sw-vault.vault.azure.net/secrets/certificate';
  app.secrets.push({ name: 'certificate', url: vault, identity: app.identity });
  app.env.SW_OIDC_CLIENT_CERTIFICATE_KEY = 'secretref:certificate';
  app.env.SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT = 'ab'.repeat(32);
  expect(() => preflight(app, fakeTarget)).not.toThrow();
  app.env.SW_OIDC_CLIENT_CERTIFICATE_KEY = '-----BEGIN PRIVATE KEY-----';
  expect(() => preflight(app, fakeTarget)).toThrow('Key Vault SW_OIDC_CLIENT_CERTIFICATE_KEY');
});
