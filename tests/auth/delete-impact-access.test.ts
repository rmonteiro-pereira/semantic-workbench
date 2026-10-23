// The delete impact is a read route, so who has unpublished work, and how much, is only for
// those who may delete the project.
import { expect, test } from 'bun:test';
import { authWorkspace } from '../helpers/auth-workspace';
import { person } from './access-fixture';
import { saveText, signedIn } from './working-copy-fixture';

const IMPACT = '/api/projects/sales-contracts/delete-impact';

test('unpublished work appears in the delete impact only for someone who may delete the project', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  const frank = as(person('frank'));
  const dave = as(person('dave'));
  const edit = (text: string) => text + '# alice was here\n';
  expect((await saveText(alice.call, 'sales-contracts', 'orders.odcs.yaml', edit)).status).toBe(
    200,
  );

  const admin = await dave.call(IMPACT);
  expect(admin.body.unpublished).toEqual([{ name: 'Alice Andrade', changes: 1 }]);
  for (const reader of [alice, frank]) {
    const impact = await reader.call(IMPACT);
    expect(impact.status).toBe(200);
    expect(impact.body.removes.project).toBe('sales-contracts');
    expect(impact.body).not.toHaveProperty('unpublished');
    expect(JSON.stringify(impact.body)).not.toContain('Alice Andrade');
  }
});
