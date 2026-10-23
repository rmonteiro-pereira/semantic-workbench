// Faults in the project export: which files the archive holds, the size limit, the Git history
// rules and the archive bytes themselves. Each tuple is the category, the module, the exact
// text and its replacement.
export const exportMutants: [string, string, string, string][] = [
  ['export-filter', 'server/projects/project-export.ts', 'path = projectPath(raw);', 'path = raw;'],
  [
    'export-filter',
    'server/projects/project-export.ts',
    'if (canRead(path)) included.push(path);',
    'included.push(path);',
  ],
  [
    'export-filter',
    'server/projects/project-export.ts',
    'else restricted += 1;',
    'else restricted += 0;',
  ],
  [
    'export-filter',
    'server/projects/project-export.ts',
    'if (path.endsWith(TEMP_SUFFIX)) continue;',
    '',
  ],
  ['export-plan', 'server/projects/project-export.ts', 'totalBytes > deps.maxBytes ||', 'false ||'],
  ['export-plan', 'server/projects/project-export.ts', 'bytes.length > remaining', 'false'],
  ['export-plan', 'server/projects/project-export.ts', 'facts.restricted > 0 ||', 'false ||'],
  ['export-plan', 'server/projects/project-export.ts', '!facts.historyAllowed ||', 'false ||'],
  [
    'export-plan',
    'server/projects/project-export.ts',
    "projectPrefix(deps.layout, slug) !== ''",
    'false',
  ],
  [
    'export-plan',
    'server/projects/project-export.ts',
    'touched.some(path => !view.canRead(slug, path))',
    'false',
  ],
  [
    'export-plan',
    'server/projects/project-export.ts',
    "const ref = reader.view ? ((await deps.git.currentRef(repo)) ?? 'HEAD') : '--all';",
    "const ref = '--all';",
  ],
  [
    'export-plan',
    'server/projects/project-export.ts',
    'read: () => readFileSync(item.file),',
    "read: () => new TextEncoder().encode(readFileSync(item.file, 'utf8').replaceAll('\\r\\n', '\\n')),",
  ],
  [
    'export-zip',
    'server/projects/zip.ts',
    'controller.enqueue(content);',
    'controller.enqueue(new TextEncoder().encode(new TextDecoder().decode(content).trim()));',
  ],
  ['export-zip', 'server/projects/zip.ts', 'const crc = crc32(content);', 'const crc = 0;'],
  [
    'export-zip',
    'server/projects/zip.ts',
    'offset += header.length + content.length;',
    'offset += content.length;',
  ],
  ['export-zip', 'server/projects/zip.ts', 'if (content.length !== entry.size)', 'if (false)'],
  [
    'export-zip',
    'server/projects/zip.ts',
    'total += 30 + nameLength + entry.size + 46 + nameLength;',
    'total += 30 + nameLength + entry.size + 45 + nameLength;',
  ],
  [
    'export-route',
    'server/routes/export.ts',
    "const historyAllowed = scope.authorize('history', { type: 'project', project: slug }).allow;",
    'const historyAllowed = true;',
  ],
  ['export-route', 'server/routes/export.ts', "if (value === '1') return true;", 'return true;'],
  [
    'export-route',
    'server/routes/export.ts',
    "'X-Export-Omitted': String(plan.omittedCount),",
    "'X-Export-Omitted': '0',",
  ],
  [
    'export-access',
    'server/auth/route-actions.ts',
    "{ ...row('GET', '/api/projects/:slug/export', 'export', project), audited: true }",
    "row('GET', '/api/projects/:slug/export', 'export', project)",
  ],
  [
    'export-access',
    'server/auth/route-actions.ts',
    "'/api/projects/:slug/export', 'export', project",
    "'/api/projects/:slug/export', 'edit', project",
  ],
];
