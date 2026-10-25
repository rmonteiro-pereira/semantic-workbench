import { expect, test } from 'bun:test';
import {
  buildArguments,
  chooseEngine,
  imageCommit,
  parseTrivyIgnore,
  pushArguments,
  registryLogin,
  scanArguments,
  validateTarget,
  trivyImage,
  scanPreparation,
  registryEnvironment,
} from '../../scripts/image';

test('both dependency stages receive patches before their frozen install', async () => {
  const dockerfile = await Bun.file('Dockerfile').text();
  for (const name of ['deps', 'prod-deps']) {
    const stage = dockerfile
      .split(/^FROM /m)
      .find(block => block.split('\n')[0]?.endsWith(` AS ${name}`));
    if (!stage) throw new Error(`Missing Docker dependency stage: ${name}`);
    const copy = stage.indexOf('COPY patches ./patches');
    const install = stage.indexOf('RUN bun install --frozen-lockfile');
    expect(copy).toBeGreaterThanOrEqual(0);
    expect(install).toBeGreaterThan(copy);
  }
});

const context = {
  engine: 'podman' as const,
  commit: 'a'.repeat(40),
  version: 'dev',
  source: 'semantic-workbench',
  created: '2026-10-22T00:00:00Z',
};

test('engine choice fails closed and Podman retains Docker HEALTHCHECK', () => {
  expect(chooseEngine(['podman'])).toBe('podman');
  expect(chooseEngine(['docker', 'podman'])).toBe('docker');
  expect(() => chooseEngine([])).toThrow('runtime unavailable');
  expect(() => chooseEngine(['podman'], 'docker')).toThrow('runtime unavailable');
  const args = buildArguments(context, ['local:extra']);
  expect(args.slice(0, 4)).toEqual(['podman', 'build', '--format', 'docker']);
  expect(args).toContain('SW_VERSION=dev');
  expect(args).toContain(`SW_COMMIT=${context.commit}`);
  expect(args).toContain(`semantic-workbench:sha-${context.commit}`);
  expect(args).toContain('semantic-workbench:dev');
  expect(args).toContain('local:extra');
  expect(buildArguments({ ...context, engine: 'docker' })).not.toContain('--format');
});

test('dirty commits are tagged locally but never pushed', () => {
  expect(imageCommit(context.commit, true)).toBe(`${context.commit}-dirty`);
  expect(() => imageCommit('short', false)).toThrow('40-hex');
  expect(() =>
    pushArguments({ ...context, commit: `${context.commit}-dirty` }, 'swexample.azurecr.io'),
  ).toThrow('-dirty');
  expect(pushArguments(context, 'swexample.azurecr.io')[0]).toEqual([
    'az',
    'acr',
    'login',
    '--name',
    'swexample',
  ]);
  expect(registryLogin('swexample.azurecr.io')).toEqual([
    'az',
    'acr',
    'login',
    '--name',
    'swexample',
  ]);
  expect(() => registryLogin('evil.example')).toThrow('Invalid Azure registry');
  expect(() => validateTarget({})).toThrow('AZURE_SUBSCRIPTION_ID');
});

test('scanner produces both gate reports and SPDX, with no container socket', () => {
  const scans = scanArguments('scan');
  expect(scans).toHaveLength(2);
  for (const command of scans) {
    expect(command).toContain('CRITICAL,HIGH');
    expect(command).toContain('--ignore-unfixed');
    expect(command).toContain('--exit-code');
    expect(command).toContain('.trivyignore');
    expect(command).toContain('--input');
  }
  expect(scanArguments('sbom')[0]).toContain('out/image/sbom.spdx.json');
  const ref = `swexample.azurecr.io/semantic-workbench@sha256:${'a'.repeat(64)}`;
  expect(scanArguments('scan', ref)[0]).toContain(ref);
  expect(() => scanArguments('scan', 'swexample.azurecr.io/semantic-workbench:latest')).toThrow(
    'pinned by digest',
  );
  expect(trivyImage).toMatch(/@sha256:[a-f0-9]{64}$/);
});

test('exceptions need real reasons and unexpired calendar dates', () => {
  const today = '2026-10-22';
  expect(parseTrivyIgnore('# empty\n', today)).toEqual([]);
  expect(parseTrivyIgnore('CVE-2026-1234 # Not reachable; expires 2026-10-22', today)).toEqual([
    'CVE-2026-1234',
  ]);
  for (const line of [
    'CVE-2026-1234',
    'CVE-2026-1234 # ; expires 2026-12-31',
    'CVE-2026-1234 # Reason; expires 2026-10-21',
    'CVE-2026-1234 # Reason; expires 2027-02-30',
  ]) {
    expect(() => parseTrivyIgnore(line, today)).toThrow();
  }
});

test('remote scans log into ACR and Podman authentication stays outside artifacts', () => {
  const ref = `swexample.azurecr.io/semantic-workbench@sha256:${'a'.repeat(64)}`;
  expect(scanPreparation(context, ref)).toEqual(['az', 'acr', 'login', '--name', 'swexample']);
  expect(registryEnvironment('podman', '/tmp/credentials')).toEqual({
    DOCKER_COMMAND: 'podman',
    DOCKER_CONFIG: '/tmp/credentials',
    REGISTRY_AUTH_FILE: '/tmp/credentials/config.json',
  });
});
