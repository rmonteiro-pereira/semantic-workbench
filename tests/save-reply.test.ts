/** Refuses malformed success replies before accepting a new source base. */
import { expect, test } from 'bun:test';
import { batchSaveReply, fileSaveReply } from '../src/app/projects/save-reply';

const saved = { path: 'model.yaml', hash: 'a'.repeat(64), source: 'name: Model' };

test('single saves require the requested file, a content hash and supported completion status', () => {
  expect(fileSaveReply(saved, saved.path, 200)).toBe(saved);
  expect(() => fileSaveReply({ ...saved, hash: '' }, saved.path, 200)).toThrow('invalid save');
  expect(() => fileSaveReply(saved, 'other.yaml', 200)).toThrow('invalid save');
  expect(() => fileSaveReply(saved, saved.path, 202)).toThrow('invalid save');
});

test('batches require complete ordered results and explicit file-creation status', () => {
  const written = [{ ...saved, created: false }];
  expect(batchSaveReply({ written }, [saved.path], 200).written).toEqual(written);
  expect(() => batchSaveReply({ written: [] }, [saved.path], 200)).toThrow('invalid batch');
  expect(() => batchSaveReply({ written: [saved] }, [saved.path], 200)).toThrow('file-creation status');
  expect(() => batchSaveReply({ written }, [saved.path], 202)).toThrow('invalid batch');
});
