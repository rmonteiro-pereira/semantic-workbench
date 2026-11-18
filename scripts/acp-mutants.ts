// Deliberate faults in the panel's access, version, protocol and lifetime rules.
/** Faults consumed by the shared mutation runner and the focused panel runner. */
export const acpMutants: [string, string, string, string][] = [
  ['acp-path', 'src/server/acp/virtual-path.ts', "if (!value.startsWith(VIRTUAL_ROOT + '/')) return refuse('prefix');", ''],
  ['acp-path', 'src/server/acp/virtual-path.ts', "segment === '..'", 'false'],
  ['acp-files', 'src/server/acp/file-requests.ts', "if (recorded !== current.file.hash) return { ok: false, failure: refused(display, 'changed') };", ''],
  ['acp-files', 'src/server/acp/file-requests.ts', "if (recorded === undefined) return { ok: false, failure: refused(display, 'unread') };", ''],
  [
    'acp-files',
    'src/server/acp/file-requests.ts',
    'const current = await currentFile(parsed.project, parsed.path);',
    "const current = { status: 200, file: { hash: dependencies.versions.get(parsed.project, parsed.path), source: 'old' } };",
  ],
  ['acp-files', 'src/server/acp/file-requests.ts', "return failure('not-available');", "return failure(status === 403 ? 'guard' : 'not-available');"],
  ['acp-conversation', 'src/server/acp/conversation.ts', 'terminal: false', 'terminal: true'],
  ['acp-surface', 'src/server/acp/client-surface.ts', "throw new JsonRpcError(RPC_ERROR.methodNotFound, 'Method not found.');", 'return {};'],
  ['acp-sessions', 'src/server/acp/session-store.ts', 'sameText(session.owner, owner)', 'true'],
  ['acp-sessions', 'src/server/acp/session-store.ts', 'if (matches) session.code = undefined;', ''],
  ['acp-sessions', 'src/server/acp/session-store.ts', 'endDueAt(session.timing, options.now()) !== undefined', 'false'],
  ['acp-state', 'src/server/acp/panel-session.ts', 'return ended(session, event.reason, now);', 'return session;'],
  ['acp-service', 'src/server/acp/panel-service.ts', "session.timing.state === 'ended'", 'false'],
  ['acp-flood', 'src/server/acp/flood-guard.ts', 'flood: now - (refusedSince ?? now) >= FLOOD_WINDOW_MS', 'flood: false'],
  ['acp-protocol', 'src/server/acp/jsonrpc-connection.ts', 'Buffer.byteLength(text) > maximumBytes', 'false'],
  ['acp-link', 'src/server/acp/frame-link.ts', "if (seq <= receivedSeq) return 'duplicate';", "if (seq <= receivedSeq) return 'accepted';"],
  ['acp-questions', 'src/server/acp/permission-questions.ts', "if (!question.optionIds.has(choice.option)) return 'unknown-option';", ''],
  ['acp-service', 'src/server/acp/panel-service.ts', '        reason,', "        reason: session.buffer.since(0).events.map(event => JSON.stringify(event)).join(''),"],
  ['acp-service', 'src/server/acp/panel-service.ts', "origin: 'acp'", "origin: 'http'"],
];

if (import.meta.main) {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { resolve, dirname } = await import('node:path');
  const root = process.cwd();
  const folder = await mkdtemp(resolve(tmpdir(), 'workbench-panel-mutants-'));
  async function run(file: string, category: string, source: string, label: string) {
    const directory = dirname(resolve(root, file));
    const rewritten = source.replace(/\bfrom\s*(['"])(\.[^'"]+)\1/g, (_all, quote, path) => `from ${quote}${resolve(directory, path)}${quote}`);
    const target = resolve(folder, label + '.ts');
    await Bun.write(target, rewritten);
    const child = Bun.spawn([process.execPath, resolve(root, 'scripts/mutation-case.ts'), target, category], { stdout: 'pipe', stderr: 'pipe' });
    const timer = setTimeout(() => child.kill(), 60_000);
    const [output, error, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    clearTimeout(timer);
    return { status, error: output + error };
  }
  try {
    for (const [index, [category, file, before, after]] of acpMutants.entries()) {
      const source = await Bun.file(file).text();
      if (!source.includes(before)) throw new Error(`Missing panel mutation anchor: ${before}`);
      const baseline = await run(file, category, source, `baseline-${index}`);
      if (baseline.status !== 0) throw new Error(`Panel baseline failed: ${baseline.error}`);
      const candidate = await run(file, category, source.replaceAll(before, after), `candidate-${index}`);
      if (candidate.status === 0) throw new Error(`Surviving panel mutant: ${before}`);
      if (!/AssertionError/.test(candidate.error)) throw new Error(`Invalid panel mutant: ${candidate.error}`);
      console.log(`KILLED ${category}: ${before}`);
    }
    console.log(`Agent panel mutants: ${acpMutants.length} killed, 0 survived.`);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
