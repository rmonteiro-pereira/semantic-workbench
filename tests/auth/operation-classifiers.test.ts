// A 2xx response is not proof that all requested effects succeeded.
import { expect, test } from 'bun:test';
import { classifyCommitResult } from '../../src/server/projects/scm';
import { classifyRemoteResult } from '../../src/server/projects/scm-remote';
import { classifyCloneAcceptance } from '../../src/server/projects/clone';
import { classifyBatchSave, classifyFileSave } from '../../src/server/projects/workspace/document-save';
import { classifyImportResult } from '../../src/server/projects/workspace/import-batch';
import { operationClassifiers } from '../../src/server/auth/operation-classifiers';

test('commit success requires its identifier and a failed push is degraded', () => {
  const committed = { committed: true, commit: 'revision' };
  expect(classifyCommitResult(committed)).toBe('ok');
  expect(classifyCommitResult({ ...committed, pushed: { ok: false, message: 'refused' } })).toBe('degraded');
  expect(classifyCommitResult({ ...committed, pushed: { ok: true, message: 'Pushed.' } })).toBe('ok');
  expect(classifyCommitResult({ committed: false, reason: 'nothing' })).toBe('refused');
  expect(classifyCommitResult({ ...committed, commit: '' })).toBe('failed');
  expect(classifyCommitResult({ committed: false, reason: 'unknown' })).toBe('failed');
});

test('remote Git validates success, conflicts and supported follow outcomes', () => {
  const result = { ok: true, conflicted: [], altered: [] };
  expect(classifyRemoteResult(result)).toBe('ok');
  expect(classifyRemoteResult({ ...result, ok: false })).toBe('failed');
  expect(classifyRemoteResult({ ...result, conflicted: ['file'] })).toBe('degraded');
  expect(classifyRemoteResult({ ...result, follow: { branch: 'main', remote: 'origin', followed: false, reason: 'guard' } })).toBe('degraded');
  expect(classifyRemoteResult({ ...result, follow: { branch: '', remote: 'origin', followed: true } })).toBe('failed');
  expect(classifyRemoteResult({ ...result, ok: 'yes' })).toBe('failed');
});

test('clone acceptance requires all nonempty identifiers without claiming completion', () => {
  const accepted = { op: 'job', name: 'Repository', slug: 'repository' };
  expect(classifyCloneAcceptance(accepted)).toBe('ok');
  expect(classifyCloneAcceptance({ ...accepted, op: '' })).toBe('failed');
  expect(classifyCloneAcceptance({ ...accepted, slug: 123 })).toBe('failed');
});

test('atomic batches and imports distinguish saved content from governance and commit effects', () => {
  const saved = { written: [{ path: 'file.yaml', hash: 'hash' }] };
  expect(classifyBatchSave(saved)).toBe('ok');
  expect(classifyBatchSave({ ...saved, demoted: [{}] })).toBe('degraded');
  expect(classifyBatchSave({ written: [{ path: 'file.yaml', hash: '' }] })).toBe('failed');
  expect(classifyImportResult({ ...saved, commit: { committed: true, commit: 'revision' } })).toBe('ok');
  expect(classifyImportResult({ ...saved, commit: { committed: false, reason: 'no-git' } })).toBe('degraded');
  expect(classifyImportResult({ ...saved, commit: { committed: false, reason: 'unknown' } })).toBe('failed');
});

test('registered response classifiers retain non-2xx refusal outcomes', async () => {
  expect(await operationClassifiers.commit(Response.json({ committed: true, commit: 'revision', pushed: { ok: false, message: 'failed' } }))).toBe('degraded');
  expect(await operationClassifiers.batchSave(new Response(null, { status: 409 }))).toBe('refused');
});

test('file save demotion and unsupported acceptance statuses are explicit', async () => {
  expect(classifyFileSave({ path: 'file.yaml', hash: 'revision', demoted: [{}] })).toBe('degraded');
  expect(classifyFileSave({ path: 'file.yaml', hash: '' })).toBe('failed');
  expect(await operationClassifiers.cloneAcceptance(Response.json({ op: 'job', name: 'Repository', slug: 'repository' }, { status: 202 }))).toBe('failed');
});
