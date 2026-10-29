// Generates runtime dry-run cases from the same requests and identities as authorization tests.
import { routeExamples } from '../tests/auth/route-actions';
import { routeFor } from '../src/server/auth/route-actions';
import { person } from '../tests/auth/access-fixture';
import { TEST_USERS, type TestUserName } from '../tests/helpers/auth-identities';

/** The fixture identities and one request per protected route, as the dry run replays them. */
export function accessMatrix() {
  const principals = (Object.keys(TEST_USERS) as TestUserName[]).map(person);
  const cases = routeExamples.flatMap(example => {
    const found = routeFor(example.method, example.path, 'server');
    if (!found || found.row.public) return [];
    const url = new URL(example.path.replaceAll('missing', 'sales-metrics'), 'http://localhost');
    const match = url.pathname.match(found.row.pattern)!;
    const resource = found.row.resource(match, url);
    return [{ case: found.row.path, action: found.row.action, resource }];
  });
  return { principals, cases };
}

if (import.meta.main) {
  await Bun.write(new URL('../policies/matrix-cases.json', import.meta.url), JSON.stringify(accessMatrix(), null, 2) + '\n');
}
