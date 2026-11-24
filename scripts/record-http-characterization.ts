// Regenerates the stable HTTP compatibility recording from disposable access fixtures.
import { characterizeHttp } from '../tests/auth/http-characterization';

const target = 'tests/fixtures/characterization/http-v1.json';
const recording = await characterizeHttp();
for (const capture of recording) {
  // Snapshot metadata is covered separately; this recording preserves the older response contract.
  if (capture.path === '/api/projects' && Array.isArray(capture.body)) {
    capture.body = capture.body.map(project => {
      const { published: _published, ...original } = project;
      return original;
    });
  }
  // Matching Cedar rules form a set, whose enumeration order can vary across processes.
  for (const record of capture.audit) {
    if (record && typeof record === 'object' && 'rules' in record && Array.isArray(record.rules)) record.rules.sort();
  }
}
await Bun.write(target, JSON.stringify(recording, null, 2) + '\n');
console.log(`HTTP characterization written to ${target}`);
