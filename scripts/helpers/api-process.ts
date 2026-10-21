// Runs an isolated API in a separate process so server work cannot stall the browser input driver.
// The child prints its URL on stdout so browser checks can connect after startup.
import { startIsolatedApi } from './isolated-api';
if (import.meta.main) {
  const api = await startIsolatedApi({ root: process.argv[2] });
  console.log('API ' + api.url);
  process.on('SIGTERM', () => {
    void api.stop().finally(() => process.exit(0));
  });
}
/** Starts an API for the supplied root in a child process and returns its URL and cleanup. */
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
