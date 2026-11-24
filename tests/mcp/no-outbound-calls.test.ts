// Starting the workbench and running every tool never reaches beyond loopback: no fetch, no socket to another address, no model call, no warehouse.
import { expect, test } from 'bun:test';
import net from 'node:net';
import { TOOLS } from '../../src/server/mcp/tool-registry';
import { startLocalServer } from './helpers/local-server';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function hostOf(first: { host?: string } | number | string, second: unknown): string | undefined {
  if (typeof first === 'object' && first) return first.host;
  return typeof second === 'string' ? second : undefined;
}

/** Records every attempt to open a connection to an address that is not this machine. */
function watchOutbound() {
  const attempts: string[] = [];
  const realFetch = globalThis.fetch;
  const realConnect = net.Socket.prototype.connect;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!LOOPBACK.has(url.hostname)) {
      attempts.push(`fetch ${url.hostname}`);
      return Promise.reject(new Error('blocked outbound fetch'));
    }
    return realFetch(input, init);
  }) as typeof fetch;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const first = args[0] as { host?: string } | number | string;
    const host = hostOf(first, args[1]);
    if (host && !LOOPBACK.has(host)) {
      attempts.push(`socket ${host}`);
      throw new Error('blocked outbound socket');
    }
    return (realConnect as (...rest: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect;
  return {
    attempts,
    restore() {
      globalThis.fetch = realFetch;
      net.Socket.prototype.connect = realConnect;
    },
  };
}

test('every tool runs with outbound connections blocked and none is attempted', async () => {
  const watch = watchOutbound();
  const server = await startLocalServer({ examples: ['mapped-commerce'] });
  try {
    const client = await server.connect();
    const call = async (name: string, args: Record<string, unknown>) => ((await client.callTool({ name, arguments: args })) as any).structuredContent;
    const project = 'mapped-commerce';
    const files = (await call('list_files', { project })).data.items;
    const path = files[0].path;
    await call('list_projects', {});
    await call('read_file', { project, path });
    await call('get_findings', { project, path });
    await call('list_trash', {});
    for (const name of ['git_status', 'git_log', 'git_branches']) await call(name, { project });
    await call('git_file_versions', { project, path });
    await call('git_show', { project, commit: 'HEAD', path });
    await call('git_diff', { project, path });
    await call('validate_text', { project, path, source: 'x: 1\n' });
    await server.handler(new Request(`${server.url}/api/projects/${project}/git/publish`, { method: 'POST', body: '{}' }));
    const catalog = await call('get_mapping_catalog', { project });
    const mappingId = catalog.data.items[0].id;
    await call('get_mapping_context', { project, mappingId });
    await call('plan_query', { project, mappingId, metrics: ['gross_revenue'] });
    await call('explain_metric', { project, path, metric: 'gross_revenue' });
    expect(watch.attempts).toEqual([]);
    expect(TOOLS.every(tool => tool.hints.openWorld === false)).toBe(true);
    const plan = (await call('plan_query', { project, mappingId, metrics: ['gross_revenue'] })).data.plan;
    // The plan is a SQL preview the workbench never runs.
    expect(plan.warnings.join(' ')).toContain('No query was executed');
  } finally {
    await server.close();
    watch.restore();
  }
}, 60_000);
