// Tests that a repository row acts for the selected project when it belongs to the repository.
import { expect, test } from 'bun:test';
import { repositoryMember, type RepositoryMembers } from '../src/app/projects/project-tree';

const members = [{ slug: 'sales' }, { slug: 'finance' }] as unknown as RepositoryMembers;

test('the repository row uses the selected project when the repository holds it', () => {
  expect(repositoryMember(members, 'finance').slug).toBe('finance');
});

test('the repository row falls back to its first project when another repository is selected', () => {
  expect(repositoryMember(members, 'elsewhere').slug).toBe('sales');
  expect(repositoryMember(members, undefined).slug).toBe('sales');
});
