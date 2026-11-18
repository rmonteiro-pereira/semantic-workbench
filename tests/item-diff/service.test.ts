import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareProjectItems } from '../../src/server/projects/item-diff';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { parseSide } from '../../src/shared/item-diff/sides';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';
import { changedOntology, type RepositoryChange } from '../helpers/item-diff-repository';
import { sh } from '../helpers/scm';
import expected from '../fixtures/item-diff/expected/service.json';

const project = 'finance';
const path = 'finance.ontology.yaml';
const relationships = 'sw1:finance/finance.ontology.yaml#ontology:Finance/concept:Customer/relationship:';
const cases: RepositoryChange[] = ['added', 'recorded-rename', 'outside-rename', 'attribute', 'removed', 'comment', 'reorder', 'crlf', 'unparsable', 'ambiguous'];

test.each(cases)('compares the saved %s state with its published definitions', async change => {
  using fixture = await itemDiffBaselineWorkspace();
  const directory = join(fixture.root, 'projects', project);
  sh(directory, ['restore', '--', 'commerce.mapped-semantic.yaml']);
  const source = changedOntology(change);
  if (change === 'recorded-rename') {
    const { hash } = fixture.ws.readFile(project, path);
    await fixture.ws.saveFile(
      project,
      path,
      {
        baseHash: hash,
        source,
        declaredMigrations: [{ kind: 'item', from: relationships + 'purchases', to: relationships + 'buys' }],
      },
      LOCAL_READER,
    );
  } else writeFileSync(join(directory, path), source);
  const answer = await compareProjectItems(fixture.ws.itemDiffSides, project, parseSide('published'), parseSide('working'), LOCAL_READER);
  expect(answer.from.version).toBe(fixture.ws.state.published().repositories[project].commit ?? 'no fixture commit');
  expect(answer.to.version).toMatch(/^[a-f0-9]{64}$/);
  expect<unknown>({
    changes: answer.changes.map(({ kind, state, name, previousAddress, ambiguous }) => ({ kind, state, name, ...(previousAddress ? { previousAddress } : {}), ambiguous })),
    notCompared: answer.notCompared,
  }).toEqual(expected[change]);
});
