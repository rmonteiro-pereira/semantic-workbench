// Keeps unrestricted local access explicit at every service call boundary.
import { expect, expectTypeOf, test } from 'bun:test';
import { requestReader } from '../../server/auth/request-scope';
import { LOCAL_READER, type Reader } from '../../server/projects/reader';
import type { Workspace } from '../../server/projects/workspace';
import type { AssignProject } from '../../server/projects/clone';

test('read services require a Reader and requests require an attached scope', () => {
  expectTypeOf<Parameters<Workspace['documentsFor']>>().toEqualTypeOf<[Reader]>();
  expectTypeOf<Parameters<Workspace['listProjects']>>().toEqualTypeOf<[Reader]>();
  expectTypeOf<Parameters<Workspace['suggestions']>>().toEqualTypeOf<[Reader]>();
  expectTypeOf<Parameters<Workspace['scm']['status']>>().toEqualTypeOf<[string, Reader]>();
  expectTypeOf<Parameters<Workspace['trash']['undo']>>().toEqualTypeOf<[string, Reader]>();
  expect(LOCAL_READER).toEqual({ view: undefined, owner: undefined });
  expect(() => requestReader(new Request('http://localhost'))).toThrow('no access scope');
});

test('grouping, document saves and clones require a Reader', () => {
  expectTypeOf<Parameters<Workspace['grouping']>>().toEqualTypeOf<[string, Reader]>();
  expectTypeOf<Parameters<Workspace['saveGrouping']>>().toEqualTypeOf<[string, unknown, Reader]>();
  expectTypeOf<Parameters<Workspace['clone']>>().toEqualTypeOf<
    [unknown, unknown, Reader, AssignProject?]
  >();
  expectTypeOf<Parameters<Workspace['saveDocument']>[2]>().toEqualTypeOf<Reader>();
});
