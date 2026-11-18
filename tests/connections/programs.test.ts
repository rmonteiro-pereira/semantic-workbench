// Checks the registration rules: redirect addresses, field limits, duplicate ids and the reserved scope.
import { expect, test } from 'bun:test';
import { emptyProgramsFile, findProgram, parseProgramsFile, programsIssues, redirectIssue } from '../../src/server/connections/programs';

const accepted = [
  'https://example.com/callback',
  'https://example.com:8443/callback',
  'https://example.com/a/b/c?x=1',
  'https://sub.example.co.uk/cb',
  'http://127.0.0.1:8765/callback',
  'http://127.0.0.1:1/',
  'http://localhost:3000/callback',
  'http://[::1]:5000/callback',
  'http://127.0.0.1:65535',
  'https://EXAMPLE.com/Callback',
  'https://example.com/with%20escape',
  'https://127.0.0.1/secure',
];

const rejected: [string, string][] = [
  ['https://example.com/cb#frag', 'fragment'],
  ['https://example.com/*', 'wildcard'],
  ['https://*.example.com/cb', 'wildcard host'],
  ['https://user@example.com/cb', 'user information'],
  ['https://user:pass@example.com/cb', 'password'],
  ['http://example.com/cb', 'http on a public host'],
  ['http://127.0.0.1/callback', 'no port'],
  ['http://localhost/callback', 'no port on localhost'],
  ['http://[::1]/callback', 'no port on ipv6'],
  ['http://127.0.0.1.example.com:80/cb', 'lookalike host'],
  ['http://localhost.example.com:3000/cb', 'lookalike localhost'],
  ['http://0.0.0.0:3000/cb', 'unspecified address'],
  ['http://10.0.0.1:3000/cb', 'private address'],
  ['myapp://callback', 'custom scheme'],
  ['cursor://anysphere.cursor/auth', 'registered custom scheme'],
  ['javascript:alert(1)', 'script scheme'],
  ['data:text/html,x', 'data scheme'],
  ['file:///etc/passwd', 'file scheme'],
  ['/relative/path', 'relative'],
  ['example.com/cb', 'no scheme'],
  ['', 'empty'],
  ['https://', 'no host'],
  ['https://example.com/ cb', 'space'],
  ['https://example.com/cb\n', 'newline'],
  ['https://example.com\\cb', 'backslash'],
  ['https://example.com/' + 'a'.repeat(500), 'too long'],
];

test('addresses that may be registered are accepted', () => {
  for (const address of accepted) expect(redirectIssue(address), address).toBeNull();
});

test('addresses that may not be registered are refused', () => {
  for (const [address, why] of rejected) expect(redirectIssue(address), why).not.toBeNull();
  expect(redirectIssue('https://example.com/' + 'a'.repeat(512 - 'https://example.com/'.length))).toBeNull();
  expect(redirectIssue(undefined)).not.toBeNull();
  expect(redirectIssue(42)).not.toBeNull();
});

const program = {
  clientId: 'reference-client',
  name: 'Protocol reference client',
  description: 'Used in acceptance runs.',
  redirectUris: ['http://127.0.0.1:8765/callback'],
  scopes: ['read', 'validate', 'edit', 'commit'],
  setupNote: 'Start the client with the callback port 8765.',
};

function documentWith(change: Record<string, unknown>) {
  return { formatVersion: 1, programs: [{ ...program, ...change }] };
}

test('a complete document parses and a program is found by its exact id', () => {
  const parsed = parseProgramsFile(documentWith({}));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(findProgram(parsed.file, 'reference-client')?.name).toBe('Protocol reference client');
  expect(findProgram(parsed.file, 'Reference-Client')).toBeUndefined();
  expect(parseProgramsFile(emptyProgramsFile()).ok).toBe(true);
});

test('each invalid field is refused with its own name', () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ clientId: 'ab' }, 'programs[0].clientId'],
    [{ clientId: 'has space' }, 'programs[0].clientId'],
    [{ clientId: 'a'.repeat(65) }, 'programs[0].clientId'],
    [{ name: '' }, 'programs[0].name'],
    [{ name: 'a'.repeat(81) }, 'programs[0].name'],
    [{ description: 'a'.repeat(501) }, 'programs[0].description'],
    [{ setupNote: 'a'.repeat(1001) }, 'programs[0].setupNote'],
    [{ redirectUris: [] }, 'programs[0].redirectUris'],
    [{ redirectUris: Array.from({ length: 6 }, (_, index) => `https://example.com/${index}`) }, 'programs[0].redirectUris'],
    [{ redirectUris: ['https://example.com/a', 'https://example.com/a'] }, 'programs[0].redirectUris[1]'],
    [{ redirectUris: ['https://example.com/a#x'] }, 'programs[0].redirectUris[0]'],
    [{ scopes: ['read', 'read'] }, 'programs[0].scopes'],
    [{ scopes: ['write'] }, 'programs[0].scopes[0]'],
    [{ secret: 'x' }, 'programs[0].secret'],
  ];
  for (const [change, field] of cases) {
    const fields = programsIssues(documentWith(change)).map(issue => issue.field);
    expect(fields, JSON.stringify(change)).toContain(field);
  }
});

test('the administration scope is refused with its reason', () => {
  const issues = programsIssues(documentWith({ scopes: ['read', 'administration'] }));
  expect(issues).toEqual([{ field: 'programs[0].scopes[1]', message: 'The administration scope is not available yet.' }]);
});

test('duplicate client ids, too many programs and unknown document fields are refused', () => {
  const duplicate = { formatVersion: 1, programs: [program, { ...program }] };
  expect(programsIssues(duplicate).map(issue => issue.field)).toContain('programs[1].clientId');
  const many = { formatVersion: 1, programs: Array.from({ length: 51 }, (_, index) => ({ ...program, clientId: `program-${index}` })) };
  expect(programsIssues(many).map(issue => issue.field)).toContain('programs');
  expect(programsIssues({ formatVersion: 1, programs: [], extra: 1 }).map(issue => issue.field)).toContain('extra');
  expect(programsIssues({ formatVersion: 2, programs: [] }).map(issue => issue.field)).toContain('formatVersion');
  expect(programsIssues(null)).toHaveLength(1);
});
