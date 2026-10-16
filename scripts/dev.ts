import{spawn}from'node:child_process';
const children=[spawn(process.execPath,['--hot','server/index.ts'],{stdio:'inherit',detached:true}),spawn(process.execPath,['--bun','x','vp','dev','--host','127.0.0.1','--strictPort'],{stdio:'inherit',detached:true})];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)if(child.pid)try{process.kill(-child.pid,'SIGTERM')}catch{}process.exitCode=code;}
for(const child of children){child.on('error',e=>{console.error(e);stop(1)});child.on('exit',code=>stop(code??0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
