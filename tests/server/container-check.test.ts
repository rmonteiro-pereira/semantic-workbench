// Exercises the check script lifecycle with an inert runtime and no sockets or containers.
import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function harness(root: string, uid: number, build = false, ports: { environment?: string; argument?: string } = {}) {
  const preload = `${root}/runtime.ts`;
  writeFileSync(
    preload,
    `
    import { appendFileSync } from 'node:fs';
    process.getuid = () => ${uid};
    Bun.which = () => '/fake/docker';
    Bun.listen = () => ({ stop() {} });
    Bun.spawn = (args) => {
      appendFileSync(${JSON.stringify(`${root}/commands`)}, JSON.stringify(args) + '\\n');
      if (args[1] === 'run') {
        console.log('ready');
        setInterval(() => {}, 10000);
        return { stdout: new ReadableStream(), stderr: new ReadableStream(),
          exited: new Promise(() => {}) };
      }
      let output = '';
      if (args[0] === 'git') {
        output = args[1] === 'rev-parse' ? 'a'.repeat(40) : ' M README.md';
      }
      return { stdout: new Response(output).body, stderr: new Response('').body,
        exited: Promise.resolve(0) };
    };
  `,
  );
  return Bun.spawn(
    [process.execPath, '--preload', preload, resolve('scripts/container-check.ts'), ...(build ? ['--build'] : ['--image', 'test-image']), ...(ports.argument ? ['--port', ports.argument] : [])],
    {
      env: { ...process.env, TMPDIR: root, SW_CONTAINER_PORT: ports.environment ?? '4310' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
}

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  test(`container check cleans up before exiting ${code} on ${signal}`, async () => {
    const root = mkdtempSync('/tmp/workbench-container-signal-');
    const child = harness(root, 1000);
    try {
      const reader = child.stdout.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('ready');
      reader.releaseLock();
      child.kill(signal);
      expect(await child.exited).toBe(code);
      const commands = readFileSync(`${root}/commands`, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as string[]);
      const started = commands.find(args => args[1] === 'run')!;
      const name = started[started.indexOf('--name') + 1];
      expect(commands).toContainEqual(['/fake/docker', 'rm', '-f', name]);
      expect(readdirSync(root).filter(name => name.startsWith('workbench-container-'))).toEqual([]);
    } finally {
      child.kill();
      await child.exited;
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('Docker rejects a non-1000 caller before invoking the runtime', async () => {
  const root = mkdtempSync('/tmp/workbench-container-uid-');
  const child = harness(root, 2000);
  try {
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stderr).text()).toContain('owned by uid 1000');
    expect(readdirSync(root)).toEqual(['runtime.ts']);
    const source = readFileSync('scripts/container-check.ts', 'utf8');
    expect(source.indexOf('process.getuid')).toBeLessThan(source.indexOf('await command(buildArguments'));
  } finally {
    child.kill();
    await child.exited;
    rmSync(root, { recursive: true, force: true });
  }
});

test('container builds use shared metadata and dirty revision tags', async () => {
  const root = mkdtempSync('/tmp/workbench-container-build-');
  const child = harness(root, 1000, true);
  try {
    const reader = child.stdout.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('ready');
    reader.releaseLock();
    child.kill('SIGTERM');
    expect(await child.exited).toBe(143);
    const commands = readFileSync(`${root}/commands`, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as string[]);
    const build = commands.find(args => args[1] === 'build')!;
    expect(build).toContain(`SW_COMMIT=${'a'.repeat(40)}-dirty`);
    expect(build).toContain(`semantic-workbench:sha-${'a'.repeat(40)}-dirty`);
    expect(build).toContain('SW_SOURCE=semantic-workbench');
    expect(build).toContain('SW_VERSION=dev');
    expect(build).not.toContain('--format');
  } finally {
    child.kill();
    await child.exited;
    rmSync(root, { recursive: true, force: true });
  }
});

test('the checked container runs read-only, without capabilities and with a /tmp tmpfs', async () => {
  const root = mkdtempSync('/tmp/workbench-container-hardening-');
  const child = harness(root, 1000);
  try {
    const reader = child.stdout.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('ready');
    reader.releaseLock();
    child.kill('SIGTERM');
    await child.exited;
    const commands = readFileSync(`${root}/commands`, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as string[]);
    const started = commands.find(args => args[1] === 'run')!;
    expect(started.join(' ')).toContain('--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges');
    expect(started.indexOf('--read-only')).toBeLessThan(started.indexOf('-v'));
  } finally {
    child.kill();
    await child.exited;
    rmSync(root, { recursive: true, force: true });
  }
});

for (const argument of [undefined, '4382']) {
  test(`container port uses ${argument ? 'the explicit flag' : 'the environment default'}`, async () => {
    const root = mkdtempSync('/tmp/workbench-container-port-');
    const child = harness(root, 1000, false, { environment: '4380', argument });
    try {
      const reader = child.stdout.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('ready');
      reader.releaseLock();
      child.kill('SIGTERM');
      expect(await child.exited).toBe(143);
      const commands = readFileSync(`${root}/commands`, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as string[]);
      const started = commands.find(args => args[1] === 'run')!;
      expect(started).toContain(`SW_PORT=${argument ?? '4380'}`);
    } finally {
      child.kill();
      await child.exited;
      rmSync(root, { recursive: true, force: true });
    }
  });
}
