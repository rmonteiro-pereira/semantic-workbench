// Separates author previews from programmatic production metric reads.
import { expect, test } from 'bun:test';
import { LOCAL_READER } from '../src/server/projects/reader';
import { testWorkspace } from './helpers/temp-data-dir';
import { publishFixture } from './helpers/published-workspace';

test('browser metrics include saved unpublished edits while agent surfaces keep the snapshot', async () => {
  using fixture = await testWorkspace();
  const { slug } = await fixture.ws.loadExample('mapped-commerce');
  await publishFixture(fixture);
  const document = fixture.ws.documents().find(document => document.project === slug && document.filename === 'commerce.mapped-semantic.yaml')!;
  await fixture.ws.saveFile(slug, document.path, { baseHash: document.hash, source: document.source.replaceAll('gross_revenue', 'unpublished_revenue') }, LOCAL_READER);
  const path = `http://localhost/api/projects/${slug}/metrics`;
  const browser = await fixture.handler(new Request(path, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
  const agent = await fixture.handler(new Request(path));
  expect(browser.status).toBe(200);
  expect(agent.status).toBe(200);
  expect(await browser.text()).toContain('unpublished_revenue');
  expect(await agent.text()).not.toContain('unpublished_revenue');
  const explain = `http://localhost/api/projects/${slug}/files/${document.path}/explain/unpublished_revenue`;
  const browserExplanation = await fixture.handler(new Request(explain, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
  const agentExplanation = await fixture.handler(new Request(explain));
  expect(browserExplanation.status).toBe(200);
  expect(agentExplanation.status).toBe(400);
  expect(await agentExplanation.json()).toEqual({ error: 'Metric unpublished_revenue is not in commerce.mapped-semantic.yaml.' });
  expect(agent.headers.has('X-Workbench-Snapshot')).toBe(false);
});
