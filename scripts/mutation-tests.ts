// Introduces faults into temporary source copies and checks that the test suite detects them.
import { adminMutants } from './admin-mutants';
import { sessionSecurityMutants } from './session-security-mutants';
import { securityReviewMutants } from './security-review-mutants';
import { checkoutMutants } from './security-review-checkout-mutants';
import { polishMutants } from './polish-mutants';
import { exportMutants } from './export-mutants';
import { sparseMutants } from './sparse-mutants';
import { exampleMetricMutants } from './example-metric-mutants';
import { themeMutants } from './theme-mutants';
import { brandMutants } from './brand-mutants';
import { observabilityMutants } from './observability-mutants';
import { chmod, mkdtemp, rm, symlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root = process.cwd();
const temp = await mkdtemp('/tmp/workbench-mutations-');
// Candidate modules live outside the project; give their bare package imports the same dependency
// tree as the real sources, without relying on Bun caches.
await symlink(resolve(root, 'node_modules'), resolve(temp, 'node_modules'), 'dir');
const mutants: [string, string, string, string][] = [
  ['clone-progress', 'src/scm/clone-progress.ts', 'state.events[operation.op]', 'undefined'],
  ['clone-progress', 'src/scm/clone-progress.ts', 'event.op !== state.operation?.op', 'false'],
  [
    'clone-progress',
    'src/scm/clone-progress.ts',
    'return { ...state, events, progress: event };',
    'return { ...state, events, progress: state.progress };',
  ],
  ['deploy-smoke', 'scripts/deploy-smoke.ts', 'health.version === expected.version', 'true'],
  ['deploy-smoke', 'scripts/deploy-smoke.ts', 'input.projects.status === 401', 'true'],
  ['deploy-smoke', 'scripts/deploy-smoke.ts', "ready.state === 'serving'", 'true'],
  ['deploy-recovery', 'scripts/deploy.ts', 'await restore(client, before)', "'skipped'"],
  ['deploy-preflight', 'scripts/deploy.ts', 'app.maxReplicas === 1', 'true'],
  ['deploy-version', 'scripts/deploy-version.ts', 'compareReleases(tag, promoted) < 0', 'false'],
  [
    'write-targets',
    'server/auth/write-access.ts',
    'if (!decision.allow) throw new WriteAccessError(action, resource, decision);',
    'if (false) throw new WriteAccessError(action, resource, decision);',
  ],
  [
    'write-targets',
    'server/auth/write-access.ts',
    'for (const resource of resources)',
    'for (const resource of resources.slice(0, 1))',
  ],
  [
    'write-drafts',
    'server/auth/route-actions.ts',
    "row('PUT', '/api/drafts/:slug/*', 'edit', file)",
    "row('PUT', '/api/drafts/:slug/*', 'viewOwnState', file)",
  ],

  ['write-body-flags', 'server/auth/route-actions.ts', "targets: 'body'", 'targets: undefined'],
  [
    'write-body-legacy',
    'server/handler.ts',
    "authorizeWrite(req, 'edit', [\n        {\n          type: 'file',\n          ...reference,\n        },\n      ]);",
    'void reference;',
  ],
  [
    'write-body-suggestions',
    'server/routes/suggestions.ts',
    "import { authorizeWrite } from '../auth/write-access';",
    "import { authorizeWrite as checkWrite } from '../auth/write-access';\nconst authorizeWrite: typeof checkWrite = (request, ...args) => {\n  if (new URL(request.url).pathname.endsWith('/accept')) return;\n  checkWrite(request, ...args);\n};",
  ],
  [
    'write-body-suggestions',
    'server/routes/suggestions.ts',
    "import { authorizeWrite } from '../auth/write-access';",
    "import { authorizeWrite as checkWrite } from '../auth/write-access';\nconst authorizeWrite: typeof checkWrite = (request, ...args) => {\n  if (new URL(request.url).pathname.endsWith('/reject')) return;\n  checkWrite(request, ...args);\n};",
  ],
  [
    'write-body-trash',
    'server/routes/trash.ts',
    "import { authorizeWrite } from '../auth/write-access';",
    "import { authorizeWrite as checkWrite } from '../auth/write-access';\nconst authorizeWrite: typeof checkWrite = (request, ...args) => {\n  if (new URL(request.url).pathname.endsWith('/undo')) return;\n  checkWrite(request, ...args);\n};",
  ],
  [
    'write-body-trash',
    'server/routes/trash.ts',
    "import { authorizeWrite } from '../auth/write-access';",
    "import { authorizeWrite as checkWrite } from '../auth/write-access';\nconst authorizeWrite: typeof checkWrite = (request, ...args) => {\n  if (new URL(request.url).pathname.endsWith('/restore')) return;\n  checkWrite(request, ...args);\n};",
  ],

  [
    'signin-sessions',
    'server/auth/sessions.ts',
    '; HttpOnly; SameSite=Lax; Path=/',
    '; SameSite=Lax; Path=/',
  ],
  ['signin-sessions', 'server/auth/sessions.ts', "? '; Secure' : ''", "? '' : ''"],
  ['signin-sessions', 'server/auth/sessions.ts', 'now - session.createdAt >= absolute', 'false'],
  [
    'signin-csrf',
    'server/auth/csrf.ts',
    "if (request.headers.get('X-SW-Request') === '1')",
    'if (true)',
  ],
  [
    'signin-nonce',
    'server/auth/oidc.ts',
    'expectedNonce: attempt.nonce,',
    'expectedNonce: undefined,',
  ],
  [
    'signin-tenant',
    'server/auth/principal.ts',
    'mapping.tenantId && tenant.toLowerCase() !== mapping.tenantId.toLowerCase()',
    'false',
  ],
  [
    'signin-directory',
    'server/auth/directory.ts',
    'return null;\n      }\n    },\n  };',
    'return ids;\n      }\n    },\n  };',
  ],
  [
    'signin-redirect',
    'server/auth/middleware.ts',
    'return options.authentication.login(url.pathname + url.search, request);',
    'return run(request);',
  ],
  [
    'signin-pages',
    'server/routes/auth.ts',
    "return authPage('signed-out');",
    "return options.login('/');",
  ],
  [
    'signin-pages',
    'server/routes/auth.ts',
    "'<p>An Admin must grant you access to this workbench.</p>'",
    "'<p>An Admin must grant you access to this workbench.</p><p>workspace-data</p>'",
  ],
  [
    'signin-config',
    'server/config.ts',
    "url.protocol === 'http:' && !(loopbackPublicUrl && isLoopbackHost(url.hostname))",
    'false',
  ],
  [
    'signin-config',
    'server/config.ts',
    'if (GRAPH_ENDPOINTS.includes(graphUrl)) return graphUrl;',
    'if (true) return graphUrl;',
  ],

  ['pipeline-script', 'scripts/pipeline-lint.ts', '!Object.hasOwn(scripts, match[1])', 'false'],
  ['pipeline-provider', 'scripts/pipeline-lint.ts', '/keycloak/i.test(source)', 'false'],

  [
    'container-lock',
    'server/projects/instance-lock.ts',
    "current.revision === ownRevision ? 'refuse' : 'handover'",
    "current.revision === ownRevision ? 'take' : 'handover'",
  ],
  [
    'container-lock',
    'server/projects/instance-lock.ts',
    "if (decision !== 'take') {",
    "if (decision !== 'take') { await options.open();",
  ],
  [
    'container-lock',
    'server/projects/instance-lock.ts',
    'opening = options.open();',
    "state = 'serving'; opening = options.open();",
  ],
  [
    'container-health',
    'server/routes/health.ts',
    "if (state !== 'serving') {",
    "if (state !== 'serving' && state !== 'handover') {",
  ],
  ['container-health', 'server/routes/health.ts', 'ok: true,', 'ok: true, workspace: [],'],

  [
    'auth-grants',
    'server/auth/grants.ts',
    'project.domain && scope.domains.includes(project.domain)',
    'project.domain',
  ],
  [
    'auth-grants',
    'server/auth/grants.ts',
    'projects.filter(project => project.domain)',
    'projects.filter(() => true)',
  ],
  [
    'auth-principal',
    'server/auth/principal.ts',
    'claims.email_verified === true ? address(claims.email) : null',
    'address(claims.email)',
  ],
  [
    'auth-principal',
    'server/auth/principal.ts',
    "candidate.includes('@') && !candidate.includes('#ext#')",
    "candidate.includes('@')",
  ],
  [
    'auth-grants',
    'server/auth/grants.ts',
    'principal.verifiedEmail?.toLowerCase()',
    'principal.verifiedEmail ?? undefined',
  ],
  [
    'auth-principal',
    'server/auth/principal.ts',
    'const groupClaim = claims[mapping.groupClaim];',
    'const groupClaim = claims.roles ?? claims[mapping.groupClaim];',
  ],
  [
    'auth-decision',
    'server/auth/authorize.ts',
    'const result = active.evaluate(principal, action, resource, context);',
    'if (!principal.grants.length) return { allow: true, rules: [], status: 200 };\n  const result = active.evaluate(principal, action, resource, context);',
  ],
  [
    'auth-compiler',
    'server/auth/role-compiler.ts',
    '...clauses(permission.conditions ?? {}),',
    '...clauses({}),',
  ],
  [
    'auth-compiler',
    'server/auth/role-compiler.ts',
    "role.id.startsWith('r_') && (action === 'admin' || action === 'agentRead')",
    "role.id.startsWith('r_') && action === 'agentRead'",
  ],
  [
    'auth-decision',
    'server/auth/authorize.ts',
    "status: 404, reason: 'not-readable'",
    "status: 403, reason: 'not-readable'",
  ],
  [
    'auth-decision',
    'server/auth/authorize.ts',
    'adminRules: validated.adminRules,',
    'adminRules: {},',
  ],
  [
    'auth-admin-guard',
    'server/auth/admin-guard.ts',
    'if (allowed) return { ok: true };',
    'if (true) return { ok: true };',
  ],
  [
    'auth-middleware',
    'server/auth/middleware.ts',
    "const failure = auditDenial(audit, { ...input, decision: 'deny' });",
    'const failure = null;',
  ],

  [
    'auth-admin-repo',
    'server/auth/admin-repo.ts',
    'if ((await version()) !== change.baseVersion) throw new AdminStaleError();',
    '',
  ],
  ['auth-admin-repo', 'server/auth/admin-repo.ts', ' || /[<>]/.test(value)', ''],
  ['auth-audit', 'server/auth/audit.ts', 'pick(input.resource, resourceKeys)', 'input.resource'],
  [
    'auth-middleware',
    'server/auth/middleware.ts',
    "if (!found) return new Response('Not found', { status: 404 });",
    'if (!found) return run(request);',
  ],
  [
    'auth-middleware',
    'server/auth/middleware.ts',
    "mode === 'server' &&\n      !(await validCsrf(",
    'false &&\n      !(await validCsrf(',
  ],
  ['auth-middleware', 'server/auth/middleware.ts', 'row.audited === true ||', ''],

  ['agent', 'server/agent/runtime.ts', 'physical.parentheses = true', 'physical.parentheses=false'],
  ['agent', 'server/agent/runtime.ts', 'if (!fieldMap.has(id))\n          throw', 'if(false)throw'],
  [
    'agent',
    'server/agent/runtime.ts',
    'context.bindings.filter(\n    b => names.size === 0 || names.has(b.rootConcept) || names.has(b.concept),\n  )',
    'context.bindings.filter(()=>true)',
  ],
  ['agent', 'server/agent/runtime.ts', 'if (metricDatasets.size > 1)\n    throw', 'if(false)throw'],
  [
    'agent',
    'server/agent/runtime.ts',
    'if (reachableWithout(join.name, target))\n        throw',
    'if(false)throw',
  ],
  [
    'agent',
    'server/agent/runtime.ts',
    'if (\n      !uniqueKeys.some',
    'if(false&&!uniqueKeys.some',
  ],
  ['agent', 'server/agent/runtime.ts', 'const sql = `SELECT', "const sql='SELECT 1;'||`SELECT"],
  ['validation', 'src/validation.ts', 'if (names.has(x[key]))\n          fail', 'if(false)fail'],
  ['validation', 'src/validation.ts', 'if (cycle.length)\n      fail', 'if(false)fail'],
  ['validation', 'src/validation.ts', '!names.has(role.concept)', 'false'],
  ['validation', 'src/validation.ts', '!fieldNames.get(r[side])!.has(k)', 'false'],
  ['validation', 'src/validation.ts', 'if (from.length !== to.length) fail', 'if(false)fail'],
  ['validation', 'src/validation.ts', 'if (validator && !validator(data))', 'if(false)'],
  [
    'validation',
    'src/validation.ts',
    "if ('error' in r) {\n        fail(q, r.error);\n        return;\n      }",
    '',
  ],
  ['validation', 'src/validation.ts', 'if (iris.has(iri))\n            fail', 'if(false)fail'],
  [
    'odcs',
    'src/odcs.ts',
    'if (target === undefined) {\n      issues.push',
    'if(false){issues.push',
  ],
  [
    'odcs',
    'src/odcs.ts',
    'keys.push({\n      from,\n      to: target',
    'if(false)keys.push({from,to:target',
  ],
  ['odcs', 'src/odcs.ts', 'if (toColumns.length !== fromColumns.length) {', 'if(false){'],
  [
    'odcs',
    'src/odcs.ts',
    'return object === undefined ? undefined : { object, column: ref.slice(dot + 1) }',
    'return object===undefined?undefined:{object,column:undefined};',
  ],
  ['references', 'src/references.ts', "if ('iri' in r) keys.push(r.iri)", ''],
  ['iri', 'src/iri.ts', 'if (Object.hasOwn(prefixes, prefix)) return', 'if(false)return'],
  [
    'agent',
    'server/agent/runtime.ts',
    'return Array.isArray(p.data.semantic_model)\n      ?',
    'return false?',
  ],
  [
    'overview',
    'src/overview.ts',
    "if (mode === 'namespaces') return distinct(visible.map(e => e.namespace?.iri));",
    "if (mode === 'namespaces') return 0;",
  ],
  [
    'overview',
    'src/overview.ts',
    "if (ns) {\n    const id = 'namespace:' + ns.iri",
    "if(false){const id='namespace:'+ns.iri;",
  ],
  ['diagnostics', 'src/diagnostics.ts', '> MAX_INPUT_BYTES', '> MAX_INPUT_BYTES * 10'],
  ['diagnostics', 'src/diagnostics.ts', '!filename.trim()', 'false'],
  [
    'diagnostics',
    'src/diagnostics.ts',
    "if (issues.some(i => i.severity === 'error'))",
    'if (false)',
  ],
  ['rdf-validation', 'src/rdf-validation.ts', 'BigInt(l.value) > BigInt(h.value)', 'false'],
  ['rdf-validation', 'src/rdf-validation.ts', 'paths.length !== 1 || !path(paths[0])', 'false'],
  ['rdf-validation', 'src/rdf-validation.ts', 'on.length !== 1 || !resource(on[0])', 'false'],
  [
    'full-layout',
    'src/full-layout.ts',
    "'elk.algorithm': 'sporeOverlap'",
    "'elk.algorithm':'fixed'",
  ],
  [
    'full-layout',
    'src/full-layout.ts',
    'result.nodes.map((n: any) =>\n      n.group\n        ?',
    'result.nodes.filter((n:any)=>n.group).map((n:any)=>n.group?',
  ],
  [
    'overview',
    'src/overview.ts',
    'group.push(edge);',
    'if(groupOf.get(edge.source)!==groupOf.get(edge.target))group.push(edge);',
  ],
  ['overview', 'src/overview.ts', 'hasClasses && !technical', 'false'],
  ['overview', 'src/overview.ts', 'if (correction) {', 'if(false){'],
  [
    'overview',
    'src/overview.ts',
    'return context.suggested.backboneEdges',
    'return 0 && context.suggested.backboneEdges',
  ],
  // Auto must skip a mode that yields a single group.
  ['overview', 'src/overview.ts', 'basisCount(mode, visible, context) >= 2', 'true'],
  // Contract communities come from foreign keys.
  [
    'overview',
    'src/overview.ts',
    'suggestCommunities(visible, [...links,',
    "suggestCommunities(visible, [...links.filter(e => e.data.kind !== 'Foreign key'),",
  ],
  [
    'overview',
    'src/overview.ts',
    'groups.get(group.id)!.entities.push(entity);',
    'groups.get(group.id)!.entities.push(entity,entity);',
  ],
  [
    'overview',
    'src/overview.ts',
    'JSON.stringify([groupOf.get(edge.source), groupOf.get(edge.target)])',
    'JSON.stringify([groupOf.get(edge.target),groupOf.get(edge.source)])',
  ],
  ['layout', 'src/layout.ts', '* 330', '*0'],
  ['layout', 'src/layout.ts', 'row % maxRows', 'row'],
  ['edge-path', 'src/edge-path.ts', 'Math.abs(coordinates[0] - sourceX) <= tolerance', 'true'],
  ['edge-path', 'src/edge-path.ts', 'Math.abs(coordinates[last] - targetX) <= tolerance', 'true'],
  ['graph', 'src/graph-view.ts', 'limit = 8', 'limit=800'],
  ['graph', 'src/graph-view.ts', 'JSON.stringify([edge.source, edge.target])', 'edge.source'],
  [
    'graph',
    'src/graph-view.ts',
    'options.center && byId.has(options.center) ? options.center :',
    '',
  ],
  ['graph', 'src/graph-view.ts', 'options.lateral !== false', 'false'],
  ['graph', 'src/graph-view.ts', 'hidden: ranked.length - shownIds.length', 'hidden:0'],
  [
    'graph',
    'src/graph-view.ts',
    '.some(w => w.startsWith(q))\n    )\n      return 2',
    '.some(w=>w.startsWith(q)))return 3;',
  ],
  [
    'graph',
    'src/graph-view.ts',
    "if (technical || !entities.some(e => e.kind === 'OWL class'))",
    'if(true)',
  ],
  [
    'routes',
    'src/graph/routes.ts',
    'while (placed.some(shares)) y += below ? 16 : -16;',
    'while (false) y += below ? 16 : -16;',
  ],
  ['routes', 'src/graph/routes.ts', 'start + i * step', 'start'],
  [
    'routes',
    'src/graph/routes.ts',
    'const ax = x - Math.sign(x - px) * r',
    'const ax=x+Math.abs(x-px)/(x-px||1)*0-r',
  ],
  ['walk', 'src/graph/walk.ts', 'walk.steps.slice(0, walk.index + 1)', 'walk.steps'],
  ['layout', 'src/layout.ts', 'x: side * (c + 1) * NEIGHBOR_COLUMN', 'x:(c+1)*NEIGHBOR_COLUMN'],
  [
    'patch',
    'src/editor/patch.ts',
    'insert: inserted.toString().replace(/\\n/g, eol)',
    'insert:inserted.toString()',
  ],
  [
    'lint',
    'src/editor/lint.ts',
    'if (!range) {\n      documentLevel.push(issue);\n      continue;\n    }',
    '{documentLevel.push(issue);continue;}',
  ],
  [
    'json-patch',
    'src/edit/json-patch.ts',
    'if (isMap(node) && isObject(oldV) && isObject(newV) && node.items.length)\n    return mapPatches(',
    'if(false)return mapPatches(',
  ],
  [
    'yaml-patch',
    'src/edit/yaml-patch.ts',
    'if (isMap(node) && isObject(oldV) && isObject(newV) && node.items.length)\n    return mapDiff(',
    'if(false)return mapDiff(',
  ],
  [
    'dependents',
    'src/edit/references.ts',
    "add(\n              path,\n              within(src, node, new RegExp(escape(name), 'g')).slice(0, 1),\n              dep(upTo(path, 'relationships')),\n            )",
    "add(path,within(src,node,new RegExp(escape(name),'g')).slice(0,1),null);",
  ],
  [
    'kpi-draft',
    'src/metrics/metric-draft.ts',
    'const e: Record<string, any> = { label: d.label.trim() || undefined, type: d.type }',
    'const e:Record<string,any>={label:d.label.trim()||undefined,type:d.type,expression:expressionFor(d)};',
  ],
  [
    'kpi-save',
    'src/metrics/metric-save.ts',
    'const extension = { ...req.extension, schema: METRIC_SCHEMA }',
    'const extension={...req.extension,schema:METRIC_SCHEMA,expression:req.metric.expression};',
  ],
  [
    'kpi-save',
    'src/metrics/metric-save.ts',
    'export const sortedBindings = (list: KpiBinding[], next: KpiBinding) =>\n  [...list, next].sort(',
    'export const sortedBindings=(list:KpiBinding[],next:KpiBinding)=>[...list,next];[].sort(',
  ],
  [
    'status-rules',
    'src/edit/item-model.ts',
    "return { item: writeExtension(after, { ...now, status: 'proposed' }), reopened: true }",
    'return {item:after,reopened:true};',
  ],
  [
    'save-client',
    'src/projects/api.ts',
    'patches && baseHash !== null ? { baseHash, patches } : { baseHash, source }',
    '{baseHash,source}',
  ],
  ['export', 'src/export.ts', 'return { filename, blob:', "return {filename:'wrong.yaml',blob:"],
  ['export', 'src/export.ts', 'new Blob([source]', "new Blob(['']"],
  [
    'model',
    'src/model.ts',
    "valuePatches(source, [...path, 'description'], description, filename)",
    "valuePatches(source, ['unrelated'], description, filename)",
  ],
  [
    'files',
    'server/projects/workspace.ts',
    'if (body.baseHash !== currentHash)\n      throw new StaleError',
    'if(false)throw new StaleError',
  ],
  [
    'files',
    'server/projects/workspace.ts',
    'if (!indexed.file.valid) throw new InputError(indexed.findings)',
    '',
  ],
  ['atomic', 'server/projects/atomic.ts', 'const temp = tempPath(path)', 'const temp=path;'],
  [
    'atomic',
    'server/projects/atomic.ts',
    "environment.platform === 'win32' && TRANSIENT_RENAME_CODES.has(code)",
    'TRANSIENT_RENAME_CODES.has(code)',
  ],
  [
    'atomic',
    'server/projects/atomic.ts',
    'if (!retryable || waited >= RENAME_RETRY_BUDGET_MS) throw error;',
    'if (!retryable) throw error;',
  ],
  [
    'atomic',
    'server/projects/atomic.ts',
    "environment.platform === 'win32' && TRANSIENT_RENAME_CODES.has(code)",
    "environment.platform === 'win32'",
  ],
  [
    'migration',
    'server/projects/migration.ts',
    'if (sha256(readFileSync(file)) !== expected)\n          throw',
    'if(false)throw',
  ],
  [
    'paths',
    'server/projects/paths.ts',
    "if (parts.some(p => p === '' || p === '.' || p === '..'))\n    throw",
    'if(false)throw',
  ],
  [
    'paths',
    'server/projects/paths.ts',
    "if (parts.some(p => p.toLowerCase() === '.git'))\n    throw",
    'if(false)throw',
  ],
  [
    'events-origin',
    'server/handler.ts',
    'if (origin && !allowedOrigins(options.port ?? 4310).includes(origin))\n      return',
    "if(origin&&!allowedOrigins(options.port??4310).includes(origin)&&new URL(req.url).pathname!=='/api/events')return",
  ],
  [
    'journal',
    'server/projects/journal.ts',
    'const forward = remaining.every(',
    'const forward=true||remaining.every(',
  ],
  [
    'trash',
    'server/projects/trash.ts',
    'if (undo && now() > Date.parse(e.undoUntil))\n      throw new GoneError',
    'if(false)throw new GoneError',
  ],
  ['trash', 'server/projects/trash.ts', 'if (existsSync(dest)) {', 'if(false){'],
  [
    'suggestions',
    'server/projects/suggestions.ts',
    'export const sameName = (a: string, b: string) => a === b',
    'export const sameName=(a:string,b:string)=>a.slice(0,4).toLowerCase()===b.slice(0,4).toLowerCase();',
  ],
  [
    'confirm',
    'server/routes/trash.ts',
    'if (!body || body.confirm !== true)\n    throw',
    'if(false)throw',
  ],
  [
    'explain',
    'server/agent/explain.ts',
    "if (rollup === 'sum' && kpi.additivity === 'non_additive')\n    return refuse(",
    'if(false)return refuse(',
  ],
  [
    'explain',
    'server/agent/explain.ts',
    'columns.includes(p?.physicalName ?? p?.name)',
    'columns.some(c=>String(p?.physicalName??p?.name).includes(c))',
  ],
  [
    'explain',
    'server/agent/explain.ts',
    'semanticModelPaths(data).map(path',
    "semanticModelPaths(data).filter(path=>path[0]!=='ontology_mappings').map(path",
  ],
  [
    'metric-extension',
    'src/metrics/extension.ts',
    'if (!validate(value))\n    for (',
    'if(false)for(',
  ],
  [
    'model-layout',
    'src/model.ts',
    '(Array.isArray(data.ontology_mappings) ? data.ontology_mappings : []).forEach(',
    '([] as any[]).forEach(',
  ],
  [
    'rdf-gate',
    'src/edit/rdf-patch/isomorphism.ts',
    'if (!isomorphic(restBefore, restAfter))\n    return',
    'if(false)return',
  ],
  [
    'fullscreen',
    'src/graph/fullscreen.ts',
    'exit(): Viewport | null {\n      const v = saved;\n      saved = null;\n      return v;\n    }',
    'exit():Viewport|null{saved=null;return null;}',
  ],
  [
    'odcs-diff',
    'src/odcs/odcs-diff.ts',
    '.filter(k => !skip.includes(k))\n    .sort()',
    '.filter(k=>!skip.includes(k)&&!/Type$/.test(k)).sort();',
  ],
  [
    'scm-block',
    'server/projects/scm.ts',
    "if (drafts.length) return new BlockedError('drafts', drafts)",
    '',
  ],
  [
    'autosave',
    'src/projects/autosave.ts',
    'if (event.errors > 0) return keep(',
    'if(false)return keep(',
  ],
  ['autosave', 'src/projects/autosave.ts', "if (state.status === 'stale') return keep(state)", ''],
  [
    'lineage',
    'src/odcs/lineage.ts',
    "edge({\n        from: columnId(parent, k.toColumns[i]),\n        to: columnId(child, c),\n        kind: 'foreign-key'",
    "edge({to:columnId(parent,k.toColumns[i]),from:columnId(child,c),kind:'foreign-key'",
  ],
  [
    'lineage',
    'src/odcs/lineage.ts',
    "if (direction !== 'up') walk('down');\n  if (direction !== 'down') walk('up')",
    "walk('down');walk('up');",
  ],
  [
    'lineage',
    'src/odcs/lineage.ts',
    'port: (id: string) => (shown.has(id) || !all.some(c => c.id === id) ? id : moreRowId(card.id)),',
    'port:(id:string)=>id,',
  ],
  [
    'lineage',
    'src/odcs/lineage.ts',
    'readers = schema.filter(\n          (o: any) => isObject(o) && (physical(o) === source || o.name === source),\n        )',
    'readers=schema.filter((o:any)=>isObject(o)&&(String(physical(o)).startsWith(String(source))||o.name===source))',
  ],
  [
    'expansion',
    'src/graph/expansion.ts',
    "for (const s of sets) {\n    if (s.kind === 'collapse') active = active.filter(a => a.id !== s.target);\n    else active.push(s);\n  }",
    "for(const s of sets){if(s.kind==='collapse'){const t=active.find(a=>a.id===s.target);active=active.filter(a=>a.id!==s.target).map(a=>t?{...a,nodes:a.nodes.filter(n=>!t.nodes.includes(n))}:a);}else active.push(s);}",
  ],
  [
    'incremental',
    'src/graph/incremental-layout.ts',
    'for (const it of items) {\n    if (out.has(it.id)) continue',
    'for(const it of items){',
  ],
  [
    'pierce',
    'src/graph/pierce.ts',
    'const budget = Math.max(1, Math.min(o.budget, PIERCE_MAX))',
    'const budget=order.length',
  ],
  [
    'pierce',
    'src/graph/pierce.ts',
    "if (o.direction !== 'in') add(e.source, e.target, e.label, e.id)",
    "if(o.direction!=='in')add(e.target,e.source,e.label,e.id);",
  ],
  [
    'mapping-graph',
    'src/mappings/mapping-graph.ts',
    'for (const p of joinPartners(id)) if (!via.includes(p)) via.push(p)',
    '',
  ],
  [
    'mapping-graph',
    'src/mappings/mapping-graph.ts',
    "if (!used.has(col.id)) col.badges.push(badge('unmapped'))",
    "if(used.has(col.id))col.badges.push(badge('unmapped'));",
  ],
  [
    'mapping-graph',
    'src/mappings/mapping-graph.ts',
    'const i = f.evidence ? cmIndex(f.evidence.path) : -1;',
    'const i = f.evidence ? cmIndex(f.evidence.path) + 1 : -1;',
  ],
  [
    'mapping-graph',
    'src/mappings/mapping-graph.ts',
    'add({\n        from: conceptCard(name, !ref.concept).id,\n        to: metric.id,\n        kind: role,',
    "add({from:conceptCard(name,!ref.concept).id,to:metric.id,kind:'measures',",
  ],
  [
    'git-exec',
    'server/projects/git.ts',
    "[...signed.config, 'commit', '-q', ...signed.trailer, '--only', '-F', '-', '--', ...list]",
    "[...signed.config,'commit','-q',...signed.trailer,'-F','-']",
  ],
  [
    'files',
    'server/projects/workspace.ts',
    'const r = await git.commitPaths(\n      repo,\n      paths.map(p => prefix + p),\n      message,\n      author,\n    )',
    'const r=await git.commitPaths(repo,await git.lsFiles(repo),message,author);',
  ],
  [
    'trash',
    'server/projects/trash.ts',
    "steps.push({ from: file, to: join(entryDir, 'payload', posix.basename(p)) })",
    '',
  ],
  [
    'git-exec',
    'server/projects/git.ts',
    'Bun.spawn([binary, ...args],',
    "Bun.spawn(['sh','-c',[binary,...args].join(' ')],",
  ],
  [
    'git-exec',
    'server/projects/git.ts',
    'if (REMOTE_COMMANDS.has(subcommandOf(args)) && !opts.remote)\n      throw',
    'if(false)throw',
  ],
  [
    'git-exec',
    'server/projects/git.ts',
    // Both commit paths lose their message check (the `if` keeps an empty statement).
    "throw new GitError('A commit message is required.');",
    ';',
  ],
  [
    'rdf-lines',
    'src/edit/rdf-patch/ntriples.ts',
    'else if (replaced.has(i))\n      patches.push({ from: l.start, to: l.start + l.text.length, insert: replaced.get(i)! })',
    'else if(l.triple)patches.push({from:l.start,to:l.start+l.text.length,insert:replaced.get(i)??ntLine(l.triple.s.value,l.triple.p.value,l.triple.o)});',
  ],
  // SQL regions and lint.
  ['sql-regions', 'src/sql/regions.ts', "if (quote === '\"' && c === '\\\\') {", 'if(false){'],
  [
    'sql-regions',
    'src/sql/regions.ts',
    "dialect = typeof d === 'string' ? d : null;\n        grammar = grammarOf(dialect)",
    "dialect=typeof d==='string'?d:null;grammar=grammarOf(null);",
  ],
  [
    'sql-regions',
    'src/sql/regions.ts',
    '|ontology_mappings/\\\\*/semantic_model(?:/\\\\*)?/)?${MODEL}$`',
    '|nothing)?${MODEL}$`',
  ],
  [
    'sql-lint',
    'src/sql/lint.ts',
    "return [\n      {\n        severity: 'warning',\n        code: 'sql'",
    "return [{severity:'error',code:'sql'",
  ],
  // Git setup: identity stays repository-local; clones are explicit, staged under data/projects/
  // and never create symbolic links.
  [
    'git-setup',
    'server/projects/git.ts',
    "['config', '--local', 'user.name', name]",
    "['config', '--global', 'user.name', name]",
  ],
  ['git-setup', 'server/projects/git.ts', '{ remote: true, credential },', '{ credential },'],
  ['git-setup', 'server/projects/git.ts', "'core.symlinks=false',", "'core.symlinks=true',"],
  [
    'clone',
    'server/projects/clone.ts',
    'const staging = join(layout.projects, CLONE_STAGING + op);',
    'const staging = join(layout.root, CLONE_STAGING + op);',
  ],
  // Several projects in one repository: manifest folders stay inside the repository, deleting
  // one subproject leaves its siblings alone, and Git actions rescan every project.
  [
    'manifest',
    'server/projects/repositories.ts',
    "path === '' ? '' : projectPath(path)",
    'String(path)',
  ],
  [
    'subproject-trash',
    'server/projects/trash.ts',
    "steps.push({ from: projectDir(layout, slug), to: join(dir, 'payload', slug) });",
    "steps.push({ from: join(layout.projects, locationOf(unit.project).repo), to: join(dir, 'payload', slug) });",
  ],
  [
    'subproject-rescan',
    'server/projects/scm.ts',
    'for (const project of projects) await deps.rescan(project);',
    'await deps.rescan(slug);',
  ],
  // Admin panel: a save is confirmed only for the reviewed proposal and never without a dry run.
  ['admin-review', 'src/admin/change-review.ts', 'review.key === key', 'true'],
  ['admin-review', 'src/admin/change-review.ts', 'Boolean(review.result.dryRunId)', 'true'],
  ['admin-save', 'src/admin/api.ts', 'if (!dryRunId)', 'if (false)'],
];
// Governance guards: approval, demotion, classification, and the write paths that apply them.
mutants.push(
  [
    'guard-decisions',
    'server/auth/guards.ts',
    'metric: { name: metric.name, status: metric.status, owner },',
    'metric: { name: metric.name, status: metric.status, owner: undefined },',
  ],
  [
    'guard-decisions',
    'server/auth/guards.ts',
    "return binding.scope.authorize('editGuarded', resource, context);",
    "return binding.scope.authorize('edit', resource, context);",
  ],
  ['guard-engine', 'src/governance/guards.ts', "status === 'approved' &&", 'false &&'],
  [
    'guard-engine',
    'src/governance/guards.ts',
    'if (options.demote && guarded.demotable) demoted.push(guarded);',
    'if (false) demoted.push(guarded);',
  ],
  [
    'guard-engine',
    'src/governance/guards.ts',
    'if (!deepEqual(old?.classification, current.classification)) {',
    'if (false) {',
  ],
  [
    'guard-save-batch',
    'server/routes/kpis.ts',
    "ws.saveFiles(slug, body.files, reader, 'save-batch')",
    "ws.saveFiles(slug, body.files, { ...reader, guard: undefined }, 'save-batch')",
  ],
  [
    'guard-pull',
    'server/routes/git.ts',
    'scm!.pull(slug, reader, credentialFor)',
    'scm!.pull(slug, { ...reader, guard: undefined }, credentialFor)',
  ],
  [
    'guard-revert',
    'server/routes/git.ts',
    'ws.revertFile(slug, b.path, baseHash, reader)',
    'ws.revertFile(slug, b.path, baseHash, { ...reader, guard: undefined })',
  ],
  [
    'guard-delete',
    'server/routes/trash.ts',
    'decodePath(file[2]), reader)',
    'decodePath(file[2]), { ...reader, guard: undefined })',
  ],
  [
    'guard-restore',
    'server/routes/trash.ts',
    'ws.trash.undo(id, reader)',
    'ws.trash.undo(id, { ...reader, guard: undefined })',
  ],
  [
    'guard-restore',
    'server/routes/trash.ts',
    'ws.trash.restore(id, body, reader)',
    'ws.trash.restore(id, body, { ...reader, guard: undefined })',
  ],
  [
    'guard-import',
    'server/routes/projects.ts',
    'body.onConflict, reader, authorizePaths',
    'body.onConflict, { ...reader, guard: undefined }, authorizePaths',
  ],
  [
    'guard-new-project',
    'server/projects/workspace.ts',
    'guardedNewProject(preflight(body.files), reader.guard, creating.domain)',
    'preflight(body.files)',
  ],
  [
    'guard-people',
    'server/auth/route-actions.ts',
    "row('GET', '/api/projects/:slug/people', 'edit', project)",
    "row('GET', '/api/projects/:slug/people', 'read', project)",
  ],
);
mutants.push(
  [
    'read-workspace',
    'server/projects/workspace.ts',
    '.filter(f => f.visible && (!view || view.canRead(p.slug, f.path)))',
    '.filter(f => f.visible)',
  ],
  [
    'read-events',
    'server/projects/events.ts',
    'const visible = access ? readableEvent(e, access) : e;\n        if (visible)',
    'const visible = e;\n        if (visible)',
  ],
  [
    'read-events',
    'server/projects/events.ts',
    "if (event.event !== 'suggestions') return access ? readableEvent(event, access) : event;",
    "if (event.event !== 'suggestions') return event;",
  ],
  [
    'read-drafts',
    'server/routes/drafts.ts',
    'owner ? ws.state.forOwner(owner) : ws.state',
    'ws.state',
  ],
  [
    'read-trash',
    'server/projects/trash.ts',
    "scope.authorize(action, { type: 'file', project: file.project, path: file.path }).allow",
    'true',
  ],
  [
    'read-git',
    'server/routes/git.ts',
    'scm.show(slug, commit, path, reader)',
    'scm.show(slug, commit, path, { view: undefined, owner: undefined })',
  ],
  [
    'read-agent',
    'server/handler.ts',
    'buildContext(ws.documentsFor(requestReader(req)), mappingRef(mappingId))',
    'buildContext(ws.documents(), mappingRef(mappingId))',
  ],
);

// Agent clients: a bearer token outside the agent API, an unchecked audience, an ignored grant,
// a session cookie that outranks the token, and a delegated token taken for a client.
mutants.push(
  ['bearer-scope', 'server/auth/bearer.ts', "pathname.startsWith('/api/agent/')", 'true'],
  ['bearer-audience', 'server/auth/bearer.ts', '        audience,\n', ''],
  ['bearer-grants', 'server/auth/cedar.ts', 'client?.projects.includes(slug) ||', 'true ||'],
  [
    'bearer-cookie',
    'server/auth/middleware.ts',
    'client ?? (await resolve(request))',
    '(await resolve(request)) ?? client',
  ],
  ['bearer-delegated', 'server/auth/principal.ts', ' || claims.scp !== undefined', ''],
);

// Remote credentials of server mode: a token never lands in Git configuration or output, only
// Admins change remotes or clone, hosts must be allowed, and remote commands stay explicit.
mutants.push(
  [
    'remote-credential',
    'server/projects/git.ts',
    'const credentialArgs = opts.credential ? credentialSetup(opts.credential).args : [];',
    'const credentialArgs = opts.credential ? credentialSetup(opts.credential).args : [];\n' +
      "    if (opts.credential?.kind === 'token')\n" +
      "      await spawnGit(dir, ['config', 'sw.token', opts.credential.token]);",
  ],
  [
    'remote-credential',
    'server/projects/git.ts',
    "const args = ['-c', 'credential.helper='];",
    'const args: string[] = [];',
  ],
  [
    'remote-credential',
    'server/projects/git.ts',
    'stderr: maskToken(redactCredentials(stderr), credential),',
    'stderr: redactCredentials(stderr),',
  ],
  [
    'remote-explicit',
    'server/projects/git.ts',
    "new Set(['fetch', 'pull', 'push', 'ls-remote', 'clone', 'remote-update'])",
    "new Set(['ls-remote', 'remote-update'])",
  ],
  [
    'remote-admin',
    'server/auth/route-actions.ts',
    "row('PUT', '/api/projects/:slug/git/remote', 'setRemote', project)",
    "row('PUT', '/api/projects/:slug/git/remote', 'edit', project)",
  ],
  [
    'remote-admin',
    'server/auth/route-actions.ts',
    "row('POST', '/api/clone', 'clone', workspace)",
    "row('POST', '/api/clone', 'createProject', workspace)",
  ],
  [
    'remote-hosts',
    'server/auth/remote-hosts.ts',
    'if (!allowedHosts.some(allowed => allowed.toLowerCase() === host)) {',
    'if (false) {',
  ],
  [
    'remote-hosts',
    'server/auth/remote-hosts.ts',
    "const secure = url?.protocol === 'https:' || (url !== null && isLoopbackHost(url.hostname));",
    'const secure = url !== null;',
  ],
  ['remote-hosts', 'server/auth/remote-hosts.ts', 'if (pushHost !== fetchHost) {', 'if (false) {'],
  [
    'remote-hosts',
    'server/auth/remote-hosts.ts',
    "return rest.includes('@') || authority.split('@').length > 2;",
    'return false;',
  ],
  [
    'remote-consent',
    'server/auth/remote-credentials.ts',
    "sameText(attempt.state, params.get('state') ?? '')",
    'true',
  ],
  ['remote-consent', 'server/auth/remote-credentials.ts', 'attempt.expiresAt > now() &&', ''],
  ['remote-consent', 'server/auth/remote-credentials.ts', 'if (!enabled()) {', 'if (false) {'],
  ['remote-guarded-fetch', 'server/projects/scm.ts', '      credential: source.credential,\n', ''],
  [
    'remote-redirect',
    'server/projects/git.ts',
    "args.push('-c', 'http.followRedirects=false');",
    "args.push('-c', 'http.followRedirects=initial');",
  ],
);

// Per-person working copies in server mode: commits name their author, publishing only
// fast-forwards, a branch another copy holds stays refused, drafts and saves stay personal, the
// published state is never edited, and protected branches need the publish right.
mutants.push(
  ['copy-author', 'server/routes/git.ts', 'author: reader.copy?.author,', 'author: undefined,'],
  [
    'copy-worktrees',
    'server/projects/worktrees.ts',
    'if (ancestor.code !== 0) throw new NotFastForwardError(branch);',
    'if (false) throw new NotFastForwardError(branch);',
  ],
  [
    'copy-worktrees',
    'server/projects/worktrees.ts',
    'if (holder && holder.key !== key) throw new BranchInUseError(branch, holder.name);\n}',
    'void holder;\n}',
  ],
  [
    'copy-publish',
    'server/projects/worktrees.ts',
    "const swap = ['update-ref', 'refs/heads/' + branch, next, previous ?? ''];",
    "const swap = ['update-ref', 'refs/heads/' + branch, next];",
  ],
  ['copy-publish', 'server/projects/worktrees.ts', '  await check(previous, next);\n', ''],
  [
    'copy-publish',
    'server/projects/worktrees.ts',
    'if (changed.stdout.trim()) throw new BaseChangedError(repo);',
    'void changed;',
  ],
  [
    'copy-publish',
    'server/projects/worktrees.ts',
    "git.run(base, ['status', '--porcelain'], { readOnly: true })",
    "git.run(base, ['status', '--porcelain', '--untracked-files=no'], { readOnly: true })",
  ],
  [
    'copy-publish',
    'server/projects/worktrees.ts',
    "  await git.run(dir, ['checkout', '-q', '--force', '--detach', 'refs/heads/' + remembered]);\n",
    '',
  ],
  [
    'copy-publish',
    'server/projects/worktrees.ts',
    'return await moveDefault(context, repo, move, check);',
    'return await moveDefault(context, repo, move, async () => {});',
  ],
  [
    'copy-publish',
    'server/projects/worktrees.ts',
    'if (named && (await isBranchName(git, dir, named))) return named;',
    'if (named) return named;',
  ],
  [
    'copy-drafts',
    'server/projects/state.ts',
    "ownerState('u' + sha256(owner).slice(0, 20))",
    "ownerState('u' + sha256('').slice(0, 20))",
  ],
  [
    'copy-save',
    'server/projects/workspace.ts',
    'clearPersonalDrafts(state, slug, [p], staging, place.copy ?? undefined)',
    'clearPersonalDrafts(state, slug, [p], staging)',
  ],
  [
    'copy-save',
    'server/projects/workspace.ts',
    'const place = await copies.writePlace(reader, slug, check);\n    const file = projectFile(place.layout, slug, p);',
    'const place = published;\n    const file = projectFile(place.layout, slug, p);',
  ],
  [
    'copy-protected',
    'server/auth/git-access.ts',
    "authorizeRepository(target, 'publish', { branch: published });",
    'void published;',
  ],
  ['copy-protected', 'server/auth/git-access.ts', 'if (push.allow) return;', 'return;'],
  [
    'guard-pull-default',
    'server/routes/git.ts',
    'scm.pullDefault(slug, reader)',
    'scm.pullDefault(slug, { ...reader, guard: undefined })',
  ],
  [
    'guard-publish',
    'server/routes/git.ts',
    'ws.publish(slug, reader)',
    'ws.publish(slug, { ...reader, guard: undefined })',
  ],
  [
    'copy-subproject',
    'server/projects/workspace.ts',
    'removeCopies: entryDir => unpublished.removeCopies(entryDir),',
    'removeCopies: () => undefined,',
  ],
  [
    'copy-suggestions',
    'server/projects/workspace.ts',
    'if (!reader.copy) return shared;',
    'return shared;',
  ],
);

// Entra sign-in through MSAL. Each mutant undoes one guard: the library choice, the cache kept in
// the session only, PKCE, the state check, a refresh that must bring a new ID token, the
// certificate credential, group overage, the loopback issuer rule, the sign-in host list, and the
// front-channel issuer.
mutants.push(
  [
    'msal-choice',
    'server/auth/sign-in-provider.ts',
    "return provider === 'entra' ? 'msal' : 'openid-client';",
    "return 'openid-client';",
  ],
  [
    'msal-cache',
    'server/auth/msal-provider.ts',
    'if (context.cacheHasChanged) cache.serialized = context.tokenCache.serialize();',
    'if (context.cacheHasChanged) cache.serialized = context.tokenCache.serialize();\n' +
      "      void Bun.write('/tmp/msal-token-cache.json', context.tokenCache.serialize());",
  ],
  ['msal-pkce', 'server/auth/msal-provider.ts', '    codeVerifier: attempt.verifier,\n', ''],
  [
    'msal-state',
    'server/auth/msal-provider.ts',
    '    codeVerifier: attempt.verifier,\n    state: attempt.state,\n',
    '    codeVerifier: attempt.verifier,\n',
  ],
  ['msal-refresh', 'server/auth/msal-provider.ts', '    tokenCache: cache.serialized,\n', ''],
  [
    'msal-refresh',
    'server/auth/msal-provider.ts',
    "  if (result.idToken === tokens.idToken) throw new SignInError('token-invalid');\n",
    '',
  ],
  [
    'msal-certificate',
    'server/auth/msal-provider.ts',
    'return { clientCertificate: { ...certificate, thumbprintSha256: auth.thumbprint } };',
    'return { clientSecret: auth.thumbprint };',
  ],
  [
    'msal-certificate',
    'server/auth/msal-provider.ts',
    'return { clientCertificate: { ...certificate, thumbprint: auth.thumbprint } };',
    'return { clientSecret: auth.thumbprint };',
  ],
  ['msal-overage', 'server/auth/authentication.ts', 'if (identity.groupOverage) {', 'if (false) {'],
  [
    'msal-authority',
    'server/config.ts',
    'const developerMock = isLoopbackHost(url.hostname) && loopbackPublicUrl;',
    'const developerMock = isLoopbackHost(url.hostname);',
  ],
  [
    'msal-host',
    'server/auth/msal-provider.ts',
    "url.protocol === 'https:' && ENTRA_LOGIN_HOSTS.includes(url.hostname) && !url.port;",
    "url.protocol === 'https:' && !url.port;",
  ],
  [
    'front-channel-issuer',
    'server/auth/authentication.ts',
    "sid !== '' && (issuer === null || issuer === config.oidc.issuer);",
    "sid !== '';",
  ],
);

// Delivery hardening. Each mutant undoes one decision: the ingress exposure checks, the lock on
// promoted tags, the refusal to overwrite a commit tag, the main-branch ancestry of a release
// commit, the service-connection gates of the pipeline files and the read-only container flags.
mutants.push(
  [
    'deploy-ingress',
    'scripts/deploy.ts',
    "['ingress external', app.ingress.external],",
    "['ingress external', true],",
  ],
  [
    'deploy-ingress',
    'scripts/deploy.ts',
    "['ingress HTTPS only', !app.ingress.allowInsecure],",
    "['ingress HTTPS only', true],",
  ],
  [
    'deploy-ingress',
    'scripts/deploy.ts',
    "['ingress transport', ['auto', 'http', 'http2'].includes(app.ingress.transport)],",
    "['ingress transport', true],",
  ],
  [
    'deploy-ingress',
    'scripts/deploy.ts',
    "['ingress CORS', app.ingress.corsOrigins.every(origin => origin === target.SW_PUBLIC_URL)],",
    "['ingress CORS', true],",
  ],
  [
    'deploy-ingress',
    'scripts/deploy.ts',
    "['SW_PUBLIC_URL', app.env.SW_PUBLIC_URL === target.SW_PUBLIC_URL],",
    "['SW_PUBLIC_URL', true],",
  ],
  [
    'deploy-ingress-read',
    'scripts/deploy-azure.ts',
    'allowInsecure: ingress?.allowInsecure !== false,',
    'allowInsecure: ingress?.allowInsecure === true,',
  ],
  [
    'deploy-ingress-read',
    'scripts/deploy-azure.ts',
    'external: ingress?.external === true,',
    'external: true,',
  ],
  [
    'deploy-ingress-read',
    'scripts/deploy-azure.ts',
    "if (!Array.isArray(policy.allowedOrigins)) return ['*'];",
    'if (!Array.isArray(policy.allowedOrigins)) return [];',
  ],
  ['deploy-lock', 'scripts/deploy.ts', '  await client.lock(release);\n', ''],
  [
    'image-lock',
    'scripts/image.ts',
    "    '--write-enabled',\n    'false',",
    "    '--write-enabled',\n    'true',",
  ],
  [
    'image-lock',
    'scripts/image.ts',
    'return [`sha-${release.commit}`, release.tag];',
    'return [release.tag, `sha-${release.commit}`];',
  ],
  [
    'deploy-lock-client',
    'scripts/deploy-azure.ts',
    'for (const tag of releaseTags(release)) await command(',
    'for (const tag of releaseTags(release).slice(0, 1)) await command(',
  ],
  ['image-push-guard', 'scripts/image.ts', 'if (existing !== null) {', 'if (false) {'],
  [
    'image-push-guard',
    'scripts/image.ts',
    'if (/NAME_UNKNOWN|MANIFEST_UNKNOWN|not found/i.test((error as Error).message)) return null;',
    'return null;',
  ],
  [
    'image-push-guard',
    'scripts/image.ts',
    'if (!existing.locked) throw Error(',
    'if (false) throw Error(',
  ],
  ['image-push-guard', 'scripts/image.ts', '    assertImageLabels(labels, context);\n', ''],
  [
    'image-push-guard',
    'scripts/image.ts',
    'if (revision !== context.commit || version !== context.version) {',
    'if (revision !== context.commit) {',
  ],
  [
    'image-push-guard',
    'scripts/image.ts',
    '  await runCommand(lockArguments(target, tag), false);\n',
    '',
  ],
  [
    'image-push-guard',
    'scripts/image.ts',
    'if (after?.digest !== digest) throw Error(',
    'if (false) throw Error(',
  ],
  [
    'image-push-guard',
    'scripts/image.ts',
    "if (!match) throw Error('The push did not report an image digest');",
    "if (!match) return Promise.resolve('sha256:' + 'e'.repeat(64));",
  ],
  ['image-push-guard', 'scripts/image.ts', 'locked: value.writeEnabled === false', 'locked: true'],
  [
    'deploy-promote-rerun',
    'scripts/deploy-azure.ts',
    '      if (current?.digest === release.digest) return;\n',
    '',
  ],
  [
    'deploy-promote-rerun',
    'scripts/deploy-azure.ts',
    'if (current) throw Error(',
    'if (false) throw Error(',
  ],
  [
    'deploy-ancestry',
    'scripts/deploy-version.ts',
    'if (code === 1) throw Error(',
    'if (false) throw Error(',
  ],
  [
    'deploy-ancestry',
    'scripts/deploy-version.ts',
    'if (code !== 0) {\n    throw Error(`Could not compare',
    'if (false) {\n    throw Error(`Could not compare',
  ],
  ['deploy-ancestry', 'scripts/deploy-version.ts', '!/^[a-f0-9]{40}$/.test(commit)', 'false'],
  ['deploy-ancestry', 'scripts/deploy-version.ts', "commit, 'origin/main']", "commit, 'HEAD']"],
  [
    'deploy-ancestry-cli',
    'scripts/deploy-version.ts',
    '  await assertCommitOnMain(process.env.SOURCE_VERSION || (await currentCommit()));\n',
    '',
  ],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    'if (node.azureSubscription && !connectionFiles.includes(file)) {',
    'if (false) {',
  ],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    '      if (job.deployment) continue;\n',
    '      continue;\n',
  ],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    'if (step.inputs?.azureSubscription && !gates.some(isReleaseGate)) {',
    'if (false) {',
  ],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    'return condition === tagCondition || condition === pushCondition;',
    'return true;',
  ],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    "check.inputs?.azureSubscription !== '${{ parameters.acrPullServiceConnection }}' ||",
    'false ||',
  ],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    "push.inputs.azureSubscription !== '${{ parameters.acrServiceConnection }}' ||",
    'false ||',
  ],
  ['pipeline-gates', 'scripts/pipeline-lint.ts', 'setup?.parameters?.fetchDepth !== 0', 'false'],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    'if (setup?.parameters?.production !== true) {',
    'if (false) {',
  ],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    'if (connectionSteps(jobs[0]).length !== 1 || connectionSteps(jobs[1]).length !== 1) {',
    'if (false) {',
  ],
  [
    'pipeline-gates',
    'scripts/pipeline-lint.ts',
    "bash: 'bun install --frozen-lockfile --production',",
    "bash: 'bun install --frozen-lockfile',",
  ],
  [
    'pipeline-pr-azure',
    'scripts/pipeline-dry-run.ts',
    "if (!branch.startsWith('refs/pull/')) return;",
    'return;',
  ],
  ['container-hardening', 'scripts/container-hardening.ts', "    '--read-only',\n", ''],
  [
    'container-hardening',
    'scripts/container-hardening.ts',
    "capabilitiesDropped: 'ALL'",
    "capabilitiesDropped: 'NET_RAW'",
  ],
  [
    'container-hardening',
    'scripts/container-hardening.ts',
    "securityOption: 'no-new-privileges'",
    "securityOption: 'seccomp=unconfined'",
  ],
  ['container-hardening', 'scripts/container-hardening.ts', "tmpfs: '/tmp'", "tmpfs: '/data'"],
);

let killed = 0;
// The askpass program is a shell script, so its mutants run the askpass case with the mutated
// script beside an unchanged Git module.
const ASKPASS = 'server/bin/sw-askpass';
const askpassMutants: [string, string][] = [
  [`"Username for 'https://$host': " | "Username for 'http://$host': ")`, `"Username for '"*)`],
  [`user="\${user%"@$host': "}"`, `user="\${user%%@*}"`],
  [`"" | */* | *@* | *\\'*) ;;`, `"") ;;`],
  [`[ -n "$host" ] || { printf '\\n'; exit 0; }`, 'true'],
  // The password branch answers any prompt, so only the redirect setting would stop a leak.
  [
    `"Password for 'https://"*"@$host': " | "Password for 'http://"*"@$host': ")`,
    `"Password for "*)\n    printf '%s\\n' "\${SW_GIT_TOKEN-}"\n    exit 0\n    ;;\n  "never")`,
  ],
];
// Administration cases extend the existing inventory without changing its categories.
mutants.push(...adminMutants);
// Authentication, session and HTTP boundary cases extend the inventory the same way.
mutants.push(...sessionSecurityMutants);
// Data access, files and Git cases extend the inventory the same way.
mutants.push(...securityReviewMutants, ...checkoutMutants);
// Wording of refusals shown to people.
mutants.push(...polishMutants);
// Project export: the files an archive holds, its size limit, its history rules and its bytes.
mutants.push(...exportMutants);
// The folder a project lives in, and the Git arguments that check out only that folder.
mutants.push(...sparseMutants);
// Example sets that lose a metric, its binding or its contract.
mutants.push(...exampleMetricMutants);
// Colour literals: the scanner, the theme check and the codemod.
mutants.push(...themeMutants);
// The brand bundle: file checks, cleaners, schema, size caps, headers and the hard-coded scan.
mutants.push(...brandMutants);
// Logging, telemetry and browser report faults.
mutants.push(...observabilityMutants);

async function run(
  category: string,
  file: string,
  source: string,
  index: string,
  env: Record<string, string> = {},
) {
  if (category.startsWith('admin-')) {
    source = source.replaceAll("new URL('../../policies/", `new URL('${root}/policies/`);
  }
  const absolute = (path: string) => resolve(dirname(resolve(root, file)), path);
  const rewritten = source
    .replace(/\bfrom\s*(['"])(\.[^'"]+)\1/g, (_all, q, path) => `from ${q}${absolute(path)}${q}`)
    .replace(
      /\bimport\(\s*(['"])(\.[^'"]+)\1\s*\)/g,
      (_all, q, path) => `import(${q}${absolute(path)}${q})`,
    );
  const target = resolve(temp, index + '.ts');
  await Bun.write(target, rewritten);
  const child = Bun.spawn(
    [process.execPath, resolve(root, 'scripts/mutation-case.ts'), target, category],
    { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...env } },
  );
  const timer = setTimeout(() => child.kill(), 10000);
  const code = await child.exited;
  clearTimeout(timer);
  const error = await new Response(child.stderr).text();
  return { code, error };
}
// Runs the askpass case with the script as it is, then with each mutant, which must fail it.
async function askpassCases() {
  const gitSource = await Bun.file('server/projects/git.ts').text();
  const script = await Bun.file(ASKPASS).text();
  const variants: [string, string][] = [['baseline', script]];
  for (const [i, [before, after]] of askpassMutants.entries()) {
    if (!script.includes(before)) throw Error(`Mutation anchor missing: ${before}`);
    variants.push([`mutant-${i}`, script.replaceAll(before, after)]);
  }
  for (const [label, text] of variants) {
    const path = resolve(temp, `askpass-${label}`);
    await Bun.write(path, text);
    await chmod(path, 0o755);
    const env = { ASKPASS_UNDER_TEST: path };
    const result = await run('askpass', 'server/projects/git.ts', gitSource, 'askpass-git', env);
    if (label === 'baseline') {
      if (result.code !== 0) throw Error(`Baseline failed (askpass): ${result.error}`);
      continue;
    }
    if (result.code === 0) throw Error(`Surviving askpass ${label}`);
    killed++;
    console.log(`KILLED askpass: ${label}`);
  }
}
// The baseline includes formatting and lint: unformatted or lint-failing code fails the gate.
for (const script of ['fmt:check', 'lint']) {
  const child = Bun.spawn([process.execPath, 'run', script], { stdout: 'pipe', stderr: 'pipe' });
  if ((await child.exited) !== 0)
    throw Error(`Baseline failed (${script}): ${await new Response(child.stdout).text()}`);
}
// Every anchor is checked before the slow runs, so one pass lists all mutants a refactor orphaned.
async function assertAnchorsPresent() {
  const missing: string[] = [];
  for (const [category, file, before] of mutants) {
    const source = await Bun.file(file).text();
    if (!source.includes(before)) missing.push(`${category} ${file}: ${before}`);
  }
  if (missing.length) throw Error(`Mutation anchors missing:\n${missing.join('\n')}`);
}
try {
  await assertAnchorsPresent();
  for (const category of new Set(mutants.map(m => m[0]))) {
    const file = mutants.find(m => m[0] === category)![1];
    const result = await run(category, file, await Bun.file(file).text(), 'baseline-' + category);
    if (result.code !== 0) throw Error(`Baseline failed (${category}): ${result.error}`);
  }
  for (const [i, [category, file, before, after]] of mutants.entries()) {
    const source = await Bun.file(file).text();
    if (!source.includes(before)) throw Error(`Mutation anchor missing: ${before}`);
    const result = await run(category, file, source.replaceAll(before, after), 'mutant-' + i);
    if (result.code === 0) throw Error(`Surviving mutant ${i}: ${before} → ${after}`);
    if (/Cannot find|SyntaxError|ModuleNotFound/.test(result.error))
      throw Error(`Invalid mutation ${i}: ${result.error}`);
    killed++;
    console.log(`KILLED ${category}: ${before} → ${after}`);
  }
  await askpassCases();
  const ui = Bun.spawn([process.execPath, resolve(root, 'scripts/ui-tests.ts')], {
    env: { ...process.env, UI_MUTATION: 'clear-nodes' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const code = await ui.exited;
  const output = await new Response(ui.stdout).text();
  const error = await new Response(ui.stderr).text();
  if (code === 0) throw Error('Surviving UI mutant: empty neighborhood node projection');
  if (!output.includes('INJECTED_CLEAR_NODES_MUTATION') || !error.includes('react-flow__node'))
    throw Error('Invalid UI mutant: ' + output + error);
  killed++;
  console.log('KILLED UI: empty neighborhood node projection');
  // Layout mutants: each must fail the responsive checks that guard it.
  const layoutMutationMarkers = {
    overlay: 'INJECTED_OVERLAY_MUTATION',
    'status-stays': 'INJECTED_STATUS_MUTATION',
    'small-text': 'INJECTED_SMALL_TEXT_MUTATION',
    'save-state-cut': 'INJECTED_SAVE_STATE_MUTATION',
    'catalog-title': 'INJECTED_CATALOG_TITLE_MUTATION',
    'far-names-small': 'INJECTED_FAR_NAMES_MUTATION',
    'graph-column-small': 'INJECTED_GRAPH_COLUMN_MUTATION',
    'graph-names-small': 'INJECTED_GRAPH_NAMES_MUTATION',
  };
  // The empty neighborhood projection counts with them.
  const layoutMutantCount = 1 + Object.keys(layoutMutationMarkers).length;
  for (const [mutation, only, label] of [
    [
      'overlay',
      'overlaps: the graph bundle',
      'status line drawn over the mini-map and zoom controls',
    ],
    ['status-stays', 'status messages', 'status messages never dismiss'],
    ['small-text', 'screens', 'sidebar label drawn below the minimum text size'],
    ['save-state-cut', 'shell:', 'save state cut with an ellipsis in a wide header'],
    ['far-names-small', '1280×720: zoomed far', 'card names drawn small when zoomed far out'],
    ['graph-column-small', 'ODCS graph: 1280×720', 'ODCS graph column names drawn at 8 px'],
    ['graph-names-small', 'graph canvases: 1280×720', 'whole-model graph names drawn at 6 px'],
    ['catalog-title', 'edit screens', 'clamped catalog description without its full-text tooltip'],
  ] as const) {
    const child = Bun.spawn([process.execPath, resolve(root, 'scripts/responsive-ui-tests.ts')], {
      env: { ...process.env, RESPONSIVE_MUTATION: mutation, RESPONSIVE_ONLY: only },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const code = await child.exited;
    const output = await new Response(child.stdout).text();
    const error = await new Response(child.stderr).text();
    if (code === 0) throw Error('Surviving UI mutant: ' + label);
    if (
      !output.includes(layoutMutationMarkers[mutation]) ||
      !/expect|Expected|toHaveCount/.test(error)
    )
      throw Error('Invalid UI mutant: ' + label + '\n' + output + error);
    killed++;
    console.log('KILLED UI: ' + label);
  }
  const total = mutants.length + askpassMutants.length + layoutMutantCount;
  console.log(
    `${killed}/${total} targeted mutants killed; all unmodified module baselines passed. ` +
      'Run test:ui for the full browser baseline.',
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
