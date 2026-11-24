// Tests the count shown on graph cards and in details: unit, period, split, zero, large counts and the off state.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrafficBadge } from '../src/app/usage/TrafficBadge';
import { TrafficMark } from '../src/app/usage/TrafficMark';
import { TrafficStoreProvider } from '../src/app/usage/use-usage';
import { answerWith, itemOf, storeWith } from './helpers/traffic-store';

const relative = (path: string) => `sw1:#model:Sales${path}`;

async function render(element: React.ReactElement, items = [itemOf('/metric:revenue', 31, { 'agent.context.read': 22, 'agent.plan': 9 })], on = true) {
  const { store } = await storeWith(async () => answerWith(items), { on });
  return renderToStaticMarkup(<TrafficStoreProvider store={store}>{element}</TrafficStoreProvider>);
}

describe('TrafficBadge', () => {
  test('states the count with its unit and period, and the split by operation in words', async () => {
    const html = await render(<TrafficBadge address={relative('/metric:revenue')} />);
    expect(html).toContain('31 requests through this workbench in the last 30 days');
    expect(html).toContain('22 context requests, 9 query plan requests');
  });

  test('writes a large count with separators and never as a bare number', async () => {
    const html = await render(<TrafficBadge address={relative('/metric:revenue')} />, [itemOf('/metric:revenue', 1_200_000)]);
    expect(html).toContain('1,200,000 requests through this workbench in the last 30 days');
  });

  test('says one request, in the singular', async () => {
    const html = await render(<TrafficBadge address={relative('/metric:revenue')} />, [itemOf('/metric:revenue', 1)]);
    expect(html).toContain('1 request through this workbench in the last 30 days');
  });

  test('says no requests for an item nobody asked about', async () => {
    const html = await render(<TrafficBadge address={relative('/metric:untouched')} />);
    expect(html).toContain('No requests through this workbench in the last 30 days');
  });

  test('the compact form leaves out the split', async () => {
    const html = await render(<TrafficBadge compact address={relative('/metric:revenue')} />);
    expect(html).toContain('31 requests');
    expect(html).not.toContain('context requests');
  });

  test('wraps a very long name instead of cutting it', async () => {
    const long = `/metric:${'a_very_long_metric_name_'.repeat(8)}`;
    const html = await render(<TrafficBadge address={relative(long)} />, [itemOf(long, 5)]);
    expect(html).toContain('5 requests through this workbench');
    expect(html).not.toContain(long);
  });

  test('renders nothing while Traffic is off, for an item without an address or while loading', async () => {
    expect(await render(<TrafficBadge address={relative('/metric:revenue')} />, undefined, false)).toBe('');
    expect(await render(<TrafficBadge address={undefined} />)).toBe('');
  });
});

describe('TrafficMark', () => {
  test('draws a ring and a bar by level and gives the count as text', async () => {
    const html = await render(<TrafficMark address={relative('/metric:revenue')} />);
    expect(html).toContain('traffic-ring');
    expect(html).toContain('--traffic-level:5');
    expect(html).toContain('31 requests through this workbench in the last 30 days');
  });

  test('draws nothing for an item with no requests or while Traffic is off', async () => {
    expect(await render(<TrafficMark address={relative('/metric:untouched')} />)).toBe('');
    expect(await render(<TrafficMark address={relative('/metric:revenue')} />, undefined, false)).toBe('');
  });
});

describe('the stylesheet', () => {
  const css = readFileSync('src/app/usage/usage.css', 'utf8');

  test('cuts no visible text: no ellipsis, line clamp or hidden overflow outside the screen-reader text', () => {
    const visible = css.replace(/\.traffic-sr\s*\{[^}]*\}/, '');
    expect(visible).not.toMatch(/text-overflow|line-clamp|overflow:\s*hidden|white-space:\s*nowrap/);
  });

  test('uses theme tokens for every colour', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});
