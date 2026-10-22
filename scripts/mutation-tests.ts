// Introduces faults into temporary source copies and checks that the test suite detects them.
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root = process.cwd();
const temp = await mkdtemp('/tmp/workbench-mutations-');
// Candidate modules live outside the project; give their bare package imports the same dependency
// tree as the real sources, without relying on Bun caches.
await symlink(resolve(root, 'node_modules'), resolve(temp, 'node_modules'), 'dir');
const mutants: [string, string, string, string][] = [
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
    'holders.ids.length + holders.bootstrapCount > 0',
    'holders.ids.length + holders.bootstrapCount >= 0',
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
  ['auth-middleware', 'server/auth/middleware.ts', "mode === 'server' &&", 'false &&'],
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
  ['routes', 'src/graph/routes.ts', 'top - 22 - above++ * 16', 'top - 22'],
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
    'if (body.baseHash !== currentHash)\n        throw new StaleError',
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
    'if (Array.isArray(data.ontology))\n      return list(data.ontology_mappings)',
    'if(Array.isArray(data.ontology))return [];if(false)return list(data.ontology_mappings)',
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
    'port: (id: string) =>\n      visible.has(id) || !card.columns.some(c => c.id === id) ? id : moreRowId(card.id)',
    'port:(id:string)=>id',
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
    "await run(cwd, ['commit', '-q', '--only', '-F', '-', '--', ...list], { stdin: message })",
    "await run(cwd,['commit','-q','-F','-'],{stdin:message});",
  ],
  [
    'files',
    'server/projects/workspace.ts',
    'const r = await git.commitPaths(\n      repo,\n      paths.map(p => prefix + p),\n      message,\n    )',
    'const r=await git.commitPaths(repo,await git.lsFiles(repo),message);',
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
  ['git-setup', 'server/projects/git.ts', '{ remote: true },', '{},'],
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
];
let killed = 0;
async function run(category: string, file: string, source: string, index: string) {
  const rewritten = source.replace(
    /\bfrom\s*(['"])(\.[^'"]+)\1/g,
    (_all, q, path) => `from ${q}${resolve(dirname(resolve(root, file)), path)}${q}`,
  );
  const target = resolve(temp, index + '.ts');
  await Bun.write(target, rewritten);
  const child = Bun.spawn(
    [process.execPath, resolve(root, 'scripts/mutation-case.ts'), target, category],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const timer = setTimeout(() => child.kill(), 10000);
  const code = await child.exited;
  clearTimeout(timer);
  const error = await new Response(child.stderr).text();
  return { code, error };
}
// The baseline includes formatting and lint: unformatted or lint-failing code fails the gate.
for (const script of ['fmt:check', 'lint']) {
  const child = Bun.spawn([process.execPath, 'run', script], { stdout: 'pipe', stderr: 'pipe' });
  if ((await child.exited) !== 0)
    throw Error(`Baseline failed (${script}): ${await new Response(child.stdout).text()}`);
}
try {
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
  for (const [mutation, only, label] of [
    ['overlay', 'overlaps: Graph', 'status line drawn over the mini-map and zoom controls'],
    ['status-stays', 'status messages', 'status messages never dismiss'],
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
      !output.includes(
        mutation === 'overlay' ? 'INJECTED_OVERLAY_MUTATION' : 'INJECTED_STATUS_MUTATION',
      ) ||
      !/expect|Expected|toHaveCount/.test(error)
    )
      throw Error('Invalid UI mutant: ' + label + '\n' + output + error);
    killed++;
    console.log('KILLED UI: ' + label);
  }
  console.log(
    `${killed}/${mutants.length + 3} targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
