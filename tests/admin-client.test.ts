import { afterEach, describe, expect, mock, test } from 'bun:test';
import { adminApi, AdminApiError, problemText } from '../src/app/admin/api';
import { canConfirm, proposalKey } from '../src/app/admin/change-review';
import { patchDiffs } from '../src/app/admin/version-diff';
import { templateRequest, windowHours } from '../src/app/admin/policy-templates';
import type { DryRun } from '../src/app/admin/types';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function respond(body: unknown, status = 200) {
  const request = mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(body, { status }),
  );
  globalThis.fetch = request as unknown as typeof fetch;
  return request;
}
const dryRun: DryRun = {
  dryRunId: 'review-1',
  changed: [],
  matrixCases: 12,
  auditCases: 5,
  people: [],
};

describe('administration client', () => {
  test('sends the proposal, version and review through the CSRF wrapper', async () => {
    const request = respond({ version: 'new' });
    await adminApi.save('grants', { grants: [] }, 'base', 'review');
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/grants');
    expect(init.method).toBe('PUT');
    expect(new Headers(init.headers).get('X-SW-Request')).toBe('1');
    expect(JSON.parse(String(init.body))).toEqual({
      grants: [],
      baseVersion: 'base',
      dryRunId: 'review',
    });
  });
  test('refuses activation with no review before sending any request', async () => {
    const request = respond({ version: 'new' });
    await expect(adminApi.save('roles', { roles: [] }, 'base', '')).rejects.toThrow('dry run');
    expect(request).not.toHaveBeenCalled();
  });
  test('sends deletion confirmation only after review', async () => {
    const request = respond({ version: 'new' });
    await adminApi.save('roles', { roles: [] }, 'base', 'review', true);
    const init = (request.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body)).confirmDeleteInUse).toBe(true);
  });
  test('preserves last-admin, stale-version and in-use refusals with their context', async () => {
    for (const details of [
      { error: 'last-admin' },
      { error: 'stale version' },
      { error: 'role in use', inUse: { roleId: 'r_a', people: [{ id: 'alice', name: 'Alice' }] } },
    ]) {
      respond(details, 409);
      try {
        await adminApi.save('roles', { roles: [] }, 'old', 'review');
        throw new Error('Unexpected success');
      } catch (error) {
        expect(error).toBeInstanceOf(AdminApiError);
        expect((error as AdminApiError).details).toEqual(details);
        expect((error as Error).message).toContain('PUT /api/admin/roles');
      }
    }
  });
  test('URL-encodes identity and group IDs and query filters', async () => {
    const request = respond({ id: 'a/b', displayName: null, resolved: false });
    expect((await adminApi.group('a/b')).resolved).toBe(false);
    expect(request.mock.calls[0][0]).toBe('/api/admin/groups/a%2Fb');
    const users = respond([]);
    await adminApi.users('alice & bob', 'none');
    expect(users.mock.calls[0][0]).toBe('/api/admin/users?q=alice+%26+bob&access=none');
  });
  test('rejects malformed successful envelopes', async () => {
    respond({ dryRunId: 4, people: [], changed: [] });
    await expect(adminApi.dryRun({ roles: [] })).rejects.toThrow('dryRunId');
    respond({ session: null, remote: {}, audit: {} });
    await expect(adminApi.settings()).rejects.toThrow('session');
  });
  test('audit export retains filters and removes the pagination cursor', async () => {
    const request = respond('csv');
    await adminApi.exportAudit({ principal: 'a|b', cursor: 'page-2', decision: 'deny' }, 'csv');
    expect(request.mock.calls[0][0]).toBe(
      '/api/audit/export?principal=a%7Cb&decision=deny&format=csv',
    );
  });
  test('normalizes version authors and per-file patches for the existing diff view', async () => {
    respond([
      {
        version: 'abc',
        author: { name: 'Dave', email: 'd@example.org' },
        at: 'today',
        message: 'grant',
        files: ['grants.json'],
      },
    ]);
    expect((await adminApi.versions())[0].author).toBe('Dave');
    respond({ 'grants.json': '@@ -1 +1 @@\n-old\n+new' });
    expect(await adminApi.diff('abc', 'def')).toEqual([
      { file: 'grants.json', before: 'old', after: 'new' },
    ]);
  });
});

test('only the exact reviewed proposal and base version can be confirmed', () => {
  const proposal = { roles: [] };
  const key = proposalKey(proposal, 'base');
  const review = { key, result: dryRun };
  expect(canConfirm(review, key)).toBe(true);
  expect(canConfirm(null, key)).toBe(false);
  expect(canConfirm(review, proposalKey({ grants: [] }, 'base'))).toBe(false);
  expect(canConfirm(review, proposalKey(proposal, 'new-base'))).toBe(false);
  expect(canConfirm({ key, result: { ...dryRun, dryRunId: '' } }, key)).toBe(false);
});

test('patch comparison preserves context without including patch metadata', () => {
  expect(patchDiffs({ 'a.cedar': '--- a\n+++ b\n@@ -1,2 +1,2 @@\n same\n-old\n+new' })).toEqual([
    { file: 'a.cedar', before: 'same\nold', after: 'same\nnew' },
  ]);
});

test('template parameters become the server request, including windows past midnight', () => {
  const parameters = {
    template: 'Time condition',
    domain: '',
    groups: '',
    role: 'editor',
    actions: 'push, edit, push',
    branch: 'main',
    start: 22,
    end: 2,
    ranges: '10.0.0.0/8, 192.168.0.0/16',
  };
  expect(templateRequest(parameters, 'p_night')).toEqual({
    template: 'time',
    id: 'p_night',
    actions: ['push', 'edit'],
    hours: [22, 23, 0, 1],
  });
  expect(windowHours(9, 12)).toEqual([9, 10, 11]);
  expect(() => windowHours(9, 9)).toThrow('different start and end');
  expect(templateRequest({ ...parameters, template: 'Network condition' }, 'p_net')).toEqual({
    template: 'network',
    id: 'p_net',
    actions: ['push', 'edit'],
    ranges: ['10.0.0.0/8', '192.168.0.0/16'],
  });
});

test('read and command endpoints retain their contracted methods and payloads', async () => {
  const cases: {
    body: unknown;
    run: () => Promise<unknown>;
    path: string;
    method?: string;
    sent?: unknown;
  }[] = [
    { body: [], run: () => adminApi.sessions(), path: '/api/admin/sessions' },
    {
      body: {},
      run: () => adminApi.endSessions('issuer|person'),
      path: '/api/admin/sessions/issuer%7Cperson',
      method: 'DELETE',
    },
    {
      body: { version: 'v' },
      run: () => adminApi.changeUser('a/b', 'deactivate', 'reason'),
      path: '/api/admin/users/a%2Fb/deactivate',
      method: 'POST',
      sent: { reason: 'reason' },
    },
    {
      body: { version: 'v' },
      run: () => adminApi.changeUser('a/b', 'reactivate', 'reason'),
      path: '/api/admin/users/a%2Fb/reactivate',
      method: 'POST',
      sent: { reason: 'reason' },
    },
    {
      body: { version: 'v' },
      run: () => adminApi.rollback('old', 'current', 'review'),
      path: '/api/admin/versions/old/rollback',
      method: 'POST',
      sent: { baseVersion: 'current', dryRunId: 'review' },
    },
    {
      body: { id: 'p_a', text: 'forbid(principal, action, resource);', enabled: true },
      run: () =>
        adminApi.policyTemplate({ template: 'time', id: 'p_a', actions: ['push'], hours: [9] }),
      path: '/api/admin/policies/template',
      method: 'POST',
      sent: { template: 'time', id: 'p_a', actions: ['push'], hours: [9] },
    },
    {
      body: dryRun,
      run: () => adminApi.dryRun({ rollbackTo: 'old' }),
      path: '/api/admin/policies/dry-run',
      method: 'POST',
      sent: { rollbackTo: 'old' },
    },
    {
      body: { ok: false, errors: [] },
      run: () => adminApi.validate([]),
      path: '/api/admin/policies/validate',
      method: 'POST',
      sent: { rules: [] },
    },
    {
      body: dryRun,
      run: () => adminApi.dryRun({ grants: [] }),
      path: '/api/admin/policies/dry-run',
      method: 'POST',
      sent: { grants: [] },
    },
    {
      body: { decision: 'deny', grants: [], roles: [], rules: [], attributes: {} },
      run: () =>
        adminApi.check({ groups: ['group'], email: 'a@example.org' }, 'edit', {
          type: 'file',
          project: 'sales',
          path: 'file.yaml',
        }),
      path: '/api/admin/check',
      method: 'POST',
      sent: {
        principal: { groups: ['group'], email: 'a@example.org' },
        action: 'edit',
        resource: { type: 'file', project: 'sales', path: 'file.yaml' },
      },
    },
    {
      body: [],
      run: () => adminApi.whoCan('sales', 'a/b'),
      path: '/api/admin/who-can?project=sales&path=a%2Fb',
    },
    {
      body: { entries: [], next: null },
      run: () => adminApi.audit({ principal: 'alice', cursor: 'next' }),
      path: '/api/audit?principal=alice&cursor=next',
    },
  ];
  for (const entry of cases) {
    const request = respond(entry.body);
    await entry.run();
    const [path, options] = request.mock.calls[0];
    expect(path).toBe(entry.path);
    expect(options?.method).toBe(entry.method ?? 'GET');
    if (entry.sent) expect(JSON.parse(String(options?.body))).toEqual(entry.sent);
  }
});

test('an error answered as plain text keeps its status and text', async () => {
  globalThis.fetch = (async () =>
    new Response('Not found', { status: 404 })) as unknown as typeof fetch;
  const failure = await adminApi.users().catch(problem => problem);
  expect(failure).toBeInstanceOf(AdminApiError);
  expect(failure.status).toBe(404);
  expect(failure.message).toBe('GET /api/admin/users?: Not found');
});

test('document responses hand back the version apart from the document to propose', async () => {
  respond({ clients: [], version: 'v1' });
  expect(await adminApi.agents()).toEqual({ version: 'v1', document: { clients: [] } });
  respond({ clients: [] });
  await expect(adminApi.agents()).rejects.toThrow('version');
});

test('dialogs show the refusal and the bootstrap recovery note, not the request', async () => {
  respond(
    { error: 'last-admin', message: 'grants: would remove the last Admin.', bootstrap: true },
    400,
  );
  const failure = await adminApi
    .save('grants', { grants: [] }, 'base', 'review')
    .catch(error => error);
  expect(problemText(failure)).toStartWith('last-admin: grants: would remove the last Admin.');
  expect(problemText(failure)).toContain('bootstrap Admin');
  expect(problemText(failure)).not.toContain('/api/admin');
  expect(problemText(new Error('plain'))).toBe('plain');
});

test('a rollback is never confirmed without the review that previewed it', async () => {
  const request = respond({ version: 'v' });
  await expect(adminApi.rollback('old', 'current', '')).rejects.toThrow('Review the rollback');
  expect(request).not.toHaveBeenCalled();
});
