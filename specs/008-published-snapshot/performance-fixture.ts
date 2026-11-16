import { rmSync } from 'node:fs';
import { testWorkspace } from '../../tests/helpers/temp-data-dir';
import { publishFixture } from '../../tests/helpers/published-workspace';
rmSync('/tmp/sw-008/performance-fixture', { recursive: true, force: true });
const fixture = await testWorkspace({ root: '/tmp/sw-008/performance-fixture', watch: false });
for (const example of ['ubl', 'commerce', 'mapped-commerce', 'mall']) await fixture.ws.loadExample(example);
await publishFixture(fixture);
fixture.ws.close();
console.log(fixture.ws.state.registry().projects.map(project => project.slug));
