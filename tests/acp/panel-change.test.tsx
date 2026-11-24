// Panel presentation preserves text and the ordinary save contract.
import { expect, test, spyOn } from 'bun:test';
import { undoAgentChange } from '../../src/app/agent/ChangeCard';
import { api, StaleSave } from '../../src/app/projects/api';

test('undo saves earlier text from the accepted version and preserves conflicts', async () => {
  const save = spyOn(api, 'save');
  const card = { id: 1, path: '/workbench/example/long/path.yaml', outcome: 'accepted', before: 'before', after: 'after', version: 'accepted-hash' } as const;
  try {
    save.mockResolvedValue({} as Awaited<ReturnType<typeof api.save>>);
    await undoAgentChange(card);
    expect(save).toHaveBeenCalledWith('example', 'long/path.yaml', 'accepted-hash', 'before');
    save.mockRejectedValue(new StaleSave('new-hash', 'new text'));
    await expect(undoAgentChange(card)).rejects.toBeInstanceOf(StaleSave);
    expect(save).toHaveBeenCalledTimes(2);
  } finally {
    save.mockRestore();
  }
});
