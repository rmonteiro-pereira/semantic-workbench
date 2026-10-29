// Defines focused administration faults separately from the existing mutation inventory.
/** Administration mutants use the same category, module, before and after tuple as the suite. */
export const adminMutants: [string, string, string, string][] = [
  [
    'admin-policy-validation',
    'src/server/auth/policies.ts',
    'if (errors.length) return { ok: false, errors };',
    'if (errors.length) return { ok: true, errors: [] };',
  ],
  [
    'admin-proposals',
    'src/server/auth/access-admin.ts',
    "if (area !== 'settings') {",
    'if (false) {',
  ],
  [
    'admin-proposals',
    'src/server/auth/access-admin.ts',
    'receipt.hash === digest(next) &&',
    'true &&',
  ],
  [
    'admin-proposals',
    'src/server/auth/access-admin.ts',
    "if (!result.ok) throw new AdminRefusal(400, { error: 'Invalid policies.', ...result });",
    '',
  ],
  [
    'admin-builtins',
    'src/server/auth/role-compiler.ts',
    'BUILTIN_ROLE_IDS.includes(role.id) || !/^r_[a-z0-9_]+$/.test(role.id)',
    'false',
  ],
  [
    'admin-proposals',
    'src/server/auth/access-admin.ts',
    'if (!grants.length || confirm === true) continue;',
    'continue;',
  ],
  ['admin-proposals', 'src/server/auth/access-admin.ts', 'ids.has(grant.roleId) ||', 'true ||'],
  [
    'admin-forbids',
    'src/server/auth/cedar.ts',
    "allow: decision === 'allow',",
    "allow: decision === 'allow' || diagnostics.reason.includes('F1-no-self-approval'),",
  ],
  [
    'admin-forbids',
    'src/server/auth/cedar.ts',
    'deactivated: principal.deactivated,',
    'deactivated: false,',
  ],
  [
    'admin-audit-scope',
    'src/server/auth/audit.ts',
    "if (projects && !projects.has(String(entry.resource.project ?? ''))) return false;",
    '',
  ],
  [
    'admin-audit-scope',
    'src/server/auth/audit.ts',
    'if (!readableResource(entry, scope)) return false;',
    '',
  ],
];
