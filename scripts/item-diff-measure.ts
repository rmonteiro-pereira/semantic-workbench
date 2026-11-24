// Measures bounded comparison and graph annotation with isolated synthetic definitions.
import { hrtime } from 'node:process';
import { inspect } from '../src/shared/core/model';
import { parseSide } from '../src/shared/item-diff/sides';
import { graphChanges } from '../src/app/item-diff/graph-changes';
import { modelOverview } from '../src/app/graph/overview';
import { compareProjectItems } from '../src/server/projects/item-diff';
import { LOCAL_READER } from '../src/server/projects/reader';
import { measurementDefinitions, measurementFixture } from './helpers/item-diff-measurement-fixture';
import { measureBrowserGraph, median } from './helpers/item-diff-measure-browser';

const path = 'performance.ontology.yaml';
const project = 'performance';

const from = parseSide('published');
const to = parseSide('working');
const milliseconds = (time: bigint) => Number(hrtime.bigint() - time) / 1e6;
async function measureComparison(count: number) {
  const { fixture, slug } = await measurementFixture(path, count);
  using workspace = fixture;
  const started = hrtime.bigint();
  const result = await compareProjectItems(workspace.ws.itemDiffSides, slug, from, to, LOCAL_READER);
  return { result, elapsed: milliseconds(started) };
}
const large = await measureComparison(1999);
console.log(`2000 items per side, ${large.result.counts.changed} changes: ${large.elapsed.toFixed(1)} ms including Git and saved-file reads`);

const model = inspect(measurementDefinitions(500, true), path);
const marks = (await measureComparison(500)).result.changes;
const baseline: number[] = [];
const enabled: number[] = [];
for (let trial = 0; trial < 41; trial++) {
  const before = hrtime.bigint();
  modelOverview(model.entities, model.edges, 'Performance');
  const regular = milliseconds(before);
  const after = hrtime.bigint();
  const graph = graphChanges(model, marks, { project, path });
  modelOverview(graph.entities, graph.edges, 'Performance');
  if (trial > 0) {
    baseline.push(regular);
    enabled.push(milliseconds(after));
  }
}
const usual = median(baseline);
const annotated = median(enabled);
console.log(`500-entity graph model median: ${usual.toFixed(2)} ms off, ${annotated.toFixed(2)} ms on, ${((annotated / usual - 1) * 100).toFixed(1)}% overhead`);

if (process.env.SW_BASE_URL) {
  const browser = await measureBrowserGraph(path);
  console.log(`500-entity browser graph median: ${browser.off.toFixed(1)} ms off, ${browser.on.toFixed(1)} ms on, ${((browser.on / browser.off - 1) * 100).toFixed(1)}% overhead`);
}
