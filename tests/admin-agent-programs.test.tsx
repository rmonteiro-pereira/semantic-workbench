import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgramFields, AgentProgramsSection } from '../src/app/admin/AgentProgramsSection';
import { AgentConnectionsSection } from '../src/app/admin/AgentConnectionsSection';
import { ADMIN_SECTIONS } from '../src/app/admin/admin-sections';
import { DryRunResult } from '../src/app/admin/ReviewChange';

test('program fields preserve long names and identify every configurable part', () => {
  const name = 'Long name '.repeat(80);
  const html = renderToStaticMarkup(
    <ProgramFields program={{ clientId: 'reference-client', name, description: '', redirectUris: ['https://client.example/callback'], scopes: ['read'], setupNote: '' }} onChange={() => {}} />,
  );
  expect(html).toContain(name);
  for (const label of ['Client id', 'Description', 'Redirect addresses', 'Allowed scopes', 'Setup note']) expect(html).toContain(label);
  expect(html).not.toContain('administration');
  expect(ADMIN_SECTIONS.some(section => section.id === 'agent-programs')).toBe(true);
  expect(ADMIN_SECTIONS.some(section => section.id === 'agent-connections')).toBe(true);
});

test('admin connection and program sections expose loading state', () => {
  expect(renderToStaticMarkup(<AgentProgramsSection />)).toContain('Loading agent programs');
  expect(renderToStaticMarkup(<AgentConnectionsSection />)).toContain('Loading connections');
});

test('review names the programs and connections that removal will end', () => {
  const html = renderToStaticMarkup(
    <DryRunResult
      result={{ dryRunId: 'receipt', changed: [], matrixCases: 0, auditCases: 0, people: [], programs: { endings: [{ clientId: 'reference-client', name: 'Example program', connections: 3 }] } }}
    />,
  );
  expect(html).toContain('Confirming ends 3 connection(s) for Example program (reference-client).');
});
