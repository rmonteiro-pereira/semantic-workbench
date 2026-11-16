// Checks cross-entry-point publication ordering on real Git refs.
import { test } from 'bun:test';
import { publicationQueueCase } from './helpers/publication-queue-case';

test('Publish, remote follow and server adoption share one repository queue', async () => {
  await publicationQueueCase();
});
