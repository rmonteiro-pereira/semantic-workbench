// Public identity pages need only the sanitized brand bundle, never workspace assets or data.
import { beforeEach, expect, test } from 'bun:test';
import { createHandler } from '../../server/handler';
import { createAccessControl } from '../../server/auth/authorize';
import { activeBrand } from '../../server/brand/active-brand';
import { accessFixture, person } from '../auth/access-fixture';
import { authWorkspace } from '../helpers/auth-workspace';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

beforeEach(useDefaultBrand);

test('anonymous and ungranted people can read only the public brand bundle', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const ungranted = access.principalFor(person('erin'));
  for (const principal of [null, ungranted]) {
    const handler = createHandler(fixture.ws, {
      mode: 'server',
      remoteCredentials: allowEveryRemote(),
      access,
      principal: () => principal,
      publicOrigin: 'http://localhost',
    });
    for (const method of ['GET', 'HEAD']) {
      for (const file of ['logo-mark.svg', 'brand.css'] as const) {
        const response = await handler(new Request(`http://localhost/brand/${file}`, { method }));
        expect(response.status).toBe(200);
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
        if (method === 'HEAD') expect(await response.text()).toBe('');
        else expect(await response.text()).toBe(activeBrand().files.get(file)!.body);
      }
    }
    for (const file of ['secret.txt', 'logo.png', '%2Fprivate.svg']) {
      const response = await handler(new Request(`http://localhost/brand/${file}`));
      expect(response.status).toBe(404);
      expect(response.headers.get('Location')).toBeNull();
    }
    const write = await handler(
      new Request('http://localhost/brand/logo-mark.svg', {
        method: 'POST',
        headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
      }),
    );
    expect(write.status).toBe(404);
    const workspaceAsset = await handler(new Request('http://localhost/assets/private.js'));
    expect(workspaceAsset.status).toBe(principal ? 302 : 401);
  }
});
