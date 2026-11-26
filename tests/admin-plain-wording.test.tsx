// Admin explains rules, scopes and project access settings in plain words.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { policySentence } from '../src/app/admin/policy-summary';
import { ProgramFields } from '../src/app/admin/AgentProgramsSection';
import { ProjectFields } from '../src/app/admin/ProjectFields';
import { SCOPE_WORDING } from '../src/shared/connections/scope-wording';
import { SCOPE_WORDING as SERVER_SCOPE_WORDING } from '../src/server/connections/scopes';
import type { ProjectsConfig } from '../src/app/admin/types';

/** The built-in rules, split at each `@id` so every rule is read on its own. */
function baselineRules(): Record<string, string> {
  const text = readFileSync('policies/baseline.cedar', 'utf8');
  const parts = text.split(/(?=@id\()/).slice(1);
  return Object.fromEntries(parts.map(part => [/@id\("([^"]+)"\)/.exec(part)![1], part]));
}

test('each policy rule reads as one sentence of what it allows or denies', () => {
  const rules = baselineRules();
  expect(policySentence(rules['B1-workspace-lists'])).toBe('Allows Read and View own state for people on the workspace.');
  expect(policySentence(rules['F7-remote-admin'])).toBe('Denies Set remote, Clone and Register projects for everyone, when its condition holds.');
  // The condition names SW::User, but the rule's head covers every principal.
  expect(policySentence(rules['F6-restricted'])).toBe('Denies every action for everyone, when its condition holds.');
  expect(policySentence('not a rule')).toBe('Read the rule text to see what it does.');
});

test('the consent page and Agent programs read the same scope wording', () => {
  expect(SERVER_SCOPE_WORDING).toBe(SCOPE_WORDING);
  const html = renderToStaticMarkup(<ProgramFields program={{ clientId: 'client', name: 'Catalog sync', description: '', redirectUris: [''], scopes: ['read'], setupNote: '' }} onChange={() => {}} />);
  for (const wording of Object.values(SCOPE_WORDING)) expect(html).toContain(wording.allows.replaceAll("'", '&#x27;'));
});

test('project access labels say what each setting does', () => {
  const project = { stewards: [], protectedBranches: [], restricted: [{ pattern: 'private/**', groups: [], emails: [] }] } as unknown as ProjectsConfig['projects'][string];
  const html = renderToStaticMarkup(<ProjectFields slug="contracts" project={project} domains={[]} onChange={() => {}} />);
  expect(html).toContain('Every signed-in person may read this project, its history and exports');
  expect(html).toContain('Steward contacts (comma separated)');
  expect(html).toContain('Groups allowed (comma separated)');
  expect(html).toContain('hidden from everyone outside its listed groups and addresses, except Admins');
  expect(html).not.toContain('informational');
});
