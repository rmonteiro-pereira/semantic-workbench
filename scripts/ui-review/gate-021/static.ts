import { join } from 'node:path';

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 5410,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const asset = Bun.file(join(process.cwd(), 'dist', pathname));
    if (await asset.exists()) return new Response(asset);
    return new Response(Bun.file('dist/index.html'));
  },
});

process.on('SIGTERM', async () => {
  await server.stop(true);
  process.exit(0);
});
console.log('STATIC_READY', process.pid);
