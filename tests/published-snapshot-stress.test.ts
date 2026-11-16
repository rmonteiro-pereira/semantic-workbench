// Forces publication between every request's pin and its first document read.
import { expect, test } from 'bun:test';
import { agentCatalog } from '../src/server/agent/runtime';
import { LOCAL_READER } from '../src/server/projects/reader';
import { locationOf, repoDir } from '../src/server/projects/paths';
import { testWorkspace } from './helpers/temp-data-dir';

test('two hundred interleaved agent requests keep their header and every catalog document on one publication', async () => {
  using fixture = await testWorkspace();
  const { slug } = await fixture.ws.loadExample('mapped-commerce');
  const repository = locationOf(fixture.ws.project(slug)).repo;
  const directory = repoDir(fixture.ws.layout, slug);
  await fixture.ws.publish(slug, LOCAL_READER);
  const expected = new Map<string, string>();
  const documents = fixture.ws.published.documents.bind(fixture.ws.published);
  const readableDocuments = fixture.ws.published.readableDocuments.bind(fixture.ws.published);
  let calls = 0;
  let release = () => {};
  let gate = Promise.resolve();
  fixture.ws.published.readableDocuments = async (...args) => {
    calls++;
    await gate;
    return readableDocuments(...args);
  };
  const responses: Response[] = [];
  for (let publication = 0; publication < 20; publication++) {
    const pin = fixture.ws.published.pin();
    expected.set(pin.commits.get(repository)!.commit, JSON.stringify(agentCatalog(await documents(pin, slug))));
    calls = 0;
    gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const pending = Array.from({ length: 10 }, () => fixture.handler(new Request(`http://localhost/api/agent/catalog?project=${slug}`)));
    try {
      while (calls < 10) await Bun.sleep(1);
      const file = fixture.ws.documents().find(document => document.project === slug && document.filename === 'commerce.mapping.yaml')!;
      await fixture.ws.saveFile(slug, file.path, { baseHash: file.hash, source: file.source.replace(/Commerce mapping[^\n]*/, `Commerce mapping ${publication}`) }, LOCAL_READER);
      await fixture.ws.git.addAll(directory);
      await fixture.ws.git.commit(directory, `Publish generation ${publication}`, true);
      await fixture.ws.publish(slug, LOCAL_READER);
    } finally {
      release();
      responses.push(...(await Promise.all(pending)));
    }
  }
  expect(responses).toHaveLength(200);
  for (const response of responses) {
    expect(response.status).toBe(200);
    const commit = response.headers.get('X-Workbench-Snapshot')!;
    expect(expected.has(commit)).toBe(true);
    expect(await response.text()).toBe(expected.get(commit)!);
  }
}, 60_000);
