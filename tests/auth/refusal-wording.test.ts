// The sentences people read when a save or a sign-in is refused: complete, grammatical and free
// of the request that caused them.
import { beforeAll, expect, test } from 'bun:test';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { readFileSync } from 'node:fs';
import { createAccessControl } from '../../src/server/auth/authorize';
import { GuardedChangeError } from '../../src/server/auth/guards';
import { requestAccess, requestReader } from '../../src/server/auth/request-scope';
import { SignInError, type SignInReason } from '../../src/server/auth/sign-in-error';
import { signInErrorResponse } from '../../src/server/routes/auth';
import { failureReason, saveStateLabel } from '../../src/app/projects/autosave';
import { hiddenCommitsLine } from '../../src/app/scm/SourceControl';
import { accessFixture, person } from './access-fixture';

beforeAll(useDefaultBrand);

const CONTRACT = readFileSync('tests/fixtures/auth-workspace/projects/sales-contracts/orders.odcs.yaml', 'utf8');

function editorRefusal(): GuardedChangeError {
  const access = createAccessControl(accessFixture());
  const request = new Request('http://localhost/api');
  const principal = access.principalFor(person('alice'));
  Object.assign(request, { [requestAccess]: access.forRequest(principal) });
  const guard = requestReader(request).guard!;
  const after = CONTRACT.replace('classification: internal', 'classification: public');
  try {
    guard([{ project: 'sales-contracts', path: 'orders.odcs.yaml', before: CONTRACT, after }]);
  } catch (error) {
    if (error instanceof GuardedChangeError) return error;
    throw error;
  }
  throw new Error('The classification change was not refused.');
}

test('a refused classification change says who may make it in complete words', () => {
  const sentence = editorRefusal().message;
  expect(sentence).toContain("needs Steward access in this project's domain, or Admin access.");
});

test('the save label does not repeat the refusal prefix', () => {
  const refused = 'Refused: this would include changing a classification.';
  expect(failureReason(refused)).toBe('this would include changing a classification.');
  expect(failureReason('file changed on disk')).toBe('file changed on disk');
  expect(failureReason(null)).toBe('the save failed');
  const state = { status: 'failed', message: refused } as Parameters<typeof saveStateLabel>[0];
  expect(saveStateLabel(state)).toBe('Not saved: this would include changing a classification.');
});

test('every sign-in failure page ends its reason with a full stop', async () => {
  const reasons: SignInReason[] = ['tenant-mismatch', 'attempt-invalid', 'token-invalid', 'provider-unreachable', 'provider-unsupported', 'session-upgraded'];
  for (const reason of reasons) {
    const html = await signInErrorResponse(new SignInError(reason)).text();
    expect(html).toMatch(/[a-z]\.<\/p>/);
  }
});

test('the history note counts commits in the singular and the plural', () => {
  expect(hiddenCommitsLine(1)).toBe('1 commit with changes you cannot open');
  expect(hiddenCommitsLine(3)).toBe('3 commits with changes you cannot open');
});
