// An isolated API in its own process (as the real app runs it), for checks that measure the
// browser while the server works: an API inside the check's own process would stall Playwright's
// input driver and be counted as typing latency. Prints its URL on stdout.
import { startIsolatedApi } from './isolated-api';
if (import.meta.main) {
  const api = await startIsolatedApi({ root: process.argv[2] });
  console.log('API ' + api.url);
  process.on('SIGTERM', () => {
    void api.stop().finally(() => process.exit(0));
  });
}
export async function startApiProcess(root: string) {
  const child = Bun.spawn([process.execPath, import.meta.path, root], {
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const reader = child.stdout.getReader();
  let text = '';
  while (!/API (\S+)\n/.test(text)) {
    const { value, done } = await reader.read();
    if (done) throw Error('API process exited.');
    text += new TextDecoder().decode(value);
  }
  const url = /API (\S+)\n/.exec(text)![1];
  return {
    url,
    stop: async () => {
      child.kill('SIGTERM');
      await child.exited;
    },
  };
}
