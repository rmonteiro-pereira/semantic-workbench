import {openWorkspace} from './projects/workspace';
import {createHandler} from './handler';
// DATA_DIR (default `data/`) is the data root; start-up runs journal recovery, the one-time v0.1.0
// migration, then scans every project folder into the cache.
// `bun --hot` re-runs this module: close the previous workspace's watchers and cache first.
const hot=globalThis as {__workbench?:{close():void}};hot.__workbench?.close();
const ws=await openWorkspace({watch:true});hot.__workbench=ws;
for(const r of ws.recovery)console.log(`[recovery] ${r.kind} ${r.opId}: ${r.outcome}`);
if(ws.migration)console.log(`[migration] ${ws.migration.status}${ws.migration.reason?`: ${ws.migration.reason}`:''}${ws.migration.status==='completed'?` (${ws.migration.verified}/${ws.migration.files} files verified in ${ws.migration.projects.length} projects; backup ${ws.migration.backup})`:''}`);
if(!ws.gitAvailable)console.log('[git] Git 2.40 or newer was not found; projects are not version-controlled until it is installed.');
else if(!ws.identityConfigured)console.log('[git] Git user.name/user.email are not configured; commits are disabled.');
// SSE connections stay open; heartbeats every 15 s keep them alive, so disable the idle timeout.
Bun.serve({hostname:'127.0.0.1',port:4310,idleTimeout:0,fetch:createHandler(ws)});
console.log(`Workbench API: http://127.0.0.1:4310 (data root ${ws.layout.root})`);
