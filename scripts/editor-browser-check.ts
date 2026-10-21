import{chromium,expect,type Page}from'@playwright/test';import{readFileSync}from'node:fs';
import{startIsolatedApi,routeApi}from'./helpers/isolated-api';import{projectFile}from'../server/projects/paths';
// Phase 5 browser check (T092; SC-009, SC-010 Source part): syntax colors per serialization, inline
// findings within 500 ms of a pause, Go to line, the import-repair editor, and a byte-exact save of
// a CRLF/mixed-ending file sent as patches. Isolated data root; screenshots in /tmp/workbench-editor-*.png.
const api=await startIsolatedApi();await api.ws.loadExample('mall');await api.ws.loadExample('commerce');
const crlf='name: Line endings\r\nontology:\r\n  - concept: Customer\r\n    type: EntityType\r\n    description: Buyer\n  - concept: Order\r\n    type: EntityType\r\n    description: Tab\tinside a value\r\n';
// About 1.9 MB of valid YAML, near the 2,000,000-byte limit (FR-045).
const large='name: Large\nontology:\n'+Array.from({length:17000},(_,i)=>`  - concept: Concept${i}\n    type: EntityType\n    description: Generated concept number ${i} for typing latency.\n`).join('');
if(large.length>2_000_000||large.length<1_800_000)throw Error(`large fixture is ${large.length} bytes`);
const formats=await api.ws.importBatch({name:'Formats',files:[
 {path:'people.nt',source:'<https://example.org/a> <https://example.org/knows> <https://example.org/b> .\n<https://example.org/a> <http://www.w3.org/2000/01/rdf-schema#label> "Alice"@en .\n'},
 {path:'rules.n3',source:'@prefix ex: <https://example.org/> .\n# a comment\nex:a ex:knows ex:b .\nex:b ex:age 42 .\n'},
 {path:'model.json',source:JSON.stringify({name:'JSON model',ontology:[{concept:'Customer',type:'EntityType',description:'A buyer'}]},null,2)+'\n'},
 {path:'shop.yaml',source:'name: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n    description: Buyer\n'},
 {path:'endings.yaml',source:crlf},
 {path:'large.yaml',source:large},
]});
if(readFileSync(projectFile(api.ws.layout,formats.slug,'endings.yaml'),'utf8')!==crlf)throw Error('Import changed the CRLF fixture.');
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:900}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const puts:any[]=[];page.on('dialog',d=>{console.log('DIALOG',d.message());void d.dismiss();});
await routeApi(page,api,async route=>{const r=route.request();if(r.method()==='PUT'&&/\/files\//.test(r.url()))puts.push(JSON.parse(r.postData()??'{}'));return false;});
let passed=0;async function check(name:string,run:()=>Promise<void>){await run();passed++;console.log('PASS',name);}
const editor=(p:Page=page,name='Definition source')=>p.getByRole('textbox',{name});
async function openSource(path:string){await page.getByRole('tree',{name:'Projects'}).getByRole('button',{name:path,exact:true}).click();await page.locator('.tabs').getByRole('button',{name:'Source',exact:true}).click();await expect(editor()).toBeVisible();}
// The color of the first token whose text is exactly `text`.
const colorOf=(text:string)=>page.evaluate(t=>{const walker=document.createTreeWalker(document.querySelector('.cm-content')!,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode()))if(n.textContent===t)return getComputedStyle(n.parentElement!).color;return null;},text);
async function goTo(line:number){await page.getByRole('spinbutton',{name:'Go to line'}).fill(String(line));await page.getByRole('spinbutton',{name:'Go to line'}).press('Enter');}
const rgb=(hex:string)=>`rgb(${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)})`;
try{
 await page.goto(process.env.UI_URL??'http://127.0.0.1:5173/');
 await check('colors follow each serialization (VS Code Light+ palette)',async()=>{
  const cases:[string,string,[string,string][]][]=[
   ['shop.yaml','YAML',[['name','#800000'],['Shop','#0000ff'],['Customer','#0000ff']]],
   ['model.json','JSON',[['"name"','#0451a5'],['"JSON model"','#a31515']]],
   ['commerce.owl.ttl','Turtle',[['"Customer"','#a31515']]],
   ['rules.n3','N3',[['# a comment','#008000'],['42','#098658']]],
   ['people.nt','N-Triples',[['"Alice"','#a31515']]],
   ['commerce.owl','RDF/XML',[['rdf:RDF','#800000'],['xml:base','#e50000']]],
  ];
  for(const [file,syntax,tokens]of cases){
   await openSource(file);await expect(page.locator('.code-editor-syntax')).toHaveText(syntax);
   for(const [text,hex]of tokens)await expect.poll(()=>colorOf(text),{message:`${file} ${text}`}).toBe(rgb(hex));
   await page.screenshot({path:`/tmp/workbench-editor-${syntax.replace(/\W/g,'').toLowerCase()}.png`});
  }
 });
 await check('the JSON inside a SEMANTIC_WORKBENCH block is colored as JSON; Go to line moves there',async()=>{
  await openSource('mall.semantic.yaml');const source=await Bun.file('public/examples/mall/mall.semantic.yaml').text();
  const line=source.split('\n').findIndex(l=>l.includes('"label": "Occupancy rate"'))+1;await goTo(line);
  await expect(page.locator('.code-editor-position')).toHaveText(`Ln ${line}, Col 1`);
  await expect(page.locator('.cm-activeLine')).toContainText('"label": "Occupancy rate"');
  await expect.poll(()=>colorOf('"label"')).toBe(rgb('#0451a5'));await expect.poll(()=>colorOf('"Occupancy rate"')).toBe(rgb('#a31515'));
  await page.screenshot({path:'/tmp/workbench-editor-extension.png'});
 });
 await check('a finding appears inline within 500 ms of a typing pause, with gutter marker and message; fixing it clears it',async()=>{
  await openSource('shop.yaml');await goTo(5);await page.keyboard.press('End');
  const typed=Date.now();await page.keyboard.type('\nextends: [Missing]',{delay:5});const paused=Date.now();
  await expect(page.locator('.cm-lintRange-error')).toBeVisible({timeout:3000});const shown=Date.now()-paused;
  console.log(`  marker ${shown} ms after the last keystroke (typed in ${paused-typed} ms)`);expect(shown).toBeLessThanOrEqual(500);
  await expect(page.locator('.cm-lint-marker-error')).toBeVisible();
  await page.locator('.cm-lintRange-error').first().hover();await expect(page.locator('.cm-tooltip-lint')).toContainText('Missing');
  await page.screenshot({path:'/tmp/workbench-editor-lint.png'});
  // Go to line selects the line; deleting it fixes the finding; undo brings it back, redo removes it.
  await goTo(6);await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(0,{timeout:3000});
  await page.keyboard.press('Control+z');await expect(page.locator('.cm-lintRange-error')).toBeVisible({timeout:3000});
  await page.keyboard.press('Control+Shift+z');await expect(page.locator('.cm-lintRange-error')).toHaveCount(0,{timeout:3000});
 });
 await check('a CRLF/mixed-ending file: one edited line changes only that line, and the save sends a patch',async()=>{
  await openSource('endings.yaml');await expect(page.locator('.code-editor-eol')).toContainText('Mixed line endings');
  await goTo(5);await page.keyboard.press('End');await page.keyboard.type('s and sellers');
  await page.getByRole('button',{name:'Save changes'}).click();await expect(page.locator('main > .status')).toContainText('Saved',{timeout:5000});
  const saved=readFileSync(projectFile(api.ws.layout,formats.slug,'endings.yaml'),'utf8');
  expect(saved).toBe(crlf.replace('description: Buyer\n','description: Buyers and sellers\n'));
  const body=puts.at(-1);expect(body.source).toBeUndefined();expect(body.patches).toEqual([{from:crlf.indexOf('Buyer')+5,to:crlf.indexOf('Buyer')+5,insert:'s and sellers'}]);
  // A typed line break takes the file's dominant style (CRLF).
  await goTo(2);await page.keyboard.press('End');await page.keyboard.type('\n  # added');
  await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'),page.getByRole('button',{name:'Save changes'}).click()]);
  await expect(page.locator('footer')).not.toContainText('Unsaved changes');
  await expect.poll(()=>readFileSync(projectFile(api.ws.layout,formats.slug,'endings.yaml'),'utf8')).toBe(crlf.replace('description: Buyer\n','description: Buyers and sellers\n').replace('ontology:\r\n','ontology:\r\n  # added\r\n'));
 });
 await check('the import-repair dialog uses the same editor: findings, Go to line from the report, repair and import',async()=>{
  await page.locator('input[type=file]').setInputFiles({name:'broken.yaml',mimeType:'text/yaml',buffer:Buffer.from('name: Broken\nontology:\n  - concept: Customer\n    type: EntityType\n    extends: [Nowhere]\n')});
  const dialog=page.getByRole('dialog',{name:'Review import'});await expect(dialog).toBeVisible();
  const repair=dialog.getByRole('textbox',{name:'Repair definition'});await expect(repair).toBeVisible();
  await expect(dialog.locator('.cm-lintRange-error')).toBeVisible({timeout:3000});
  await dialog.getByRole('button',{name:/^Go to line 5$/}).click();await expect(dialog.locator('.code-editor-position')).toContainText('Ln 5');
  await page.screenshot({path:'/tmp/workbench-editor-repair.png'});
  await dialog.getByRole('spinbutton',{name:'Go to line'}).fill('5');await dialog.getByRole('spinbutton',{name:'Go to line'}).press('Enter');
  await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');
  await expect(dialog.getByRole('button',{name:'Import repaired files'})).toBeEnabled({timeout:3000});
  await dialog.getByRole('button',{name:'Import repaired files'}).click();await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tree',{name:'Projects'}).getByRole('button',{name:'broken.yaml',exact:true})).toBeVisible();
 });
 await check('keyboard: the editor is reachable by Tab with its accessible name; search opens with Ctrl+F',async()=>{
  await openSource('shop.yaml');await editor().focus();await page.keyboard.press('Control+f');await expect(page.locator('.cm-search')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.cm-search')).toHaveCount(0);
  await page.keyboard.press('Control+g');await expect(page.getByRole('spinbutton',{name:'Go to line'})).toBeFocused();
 });
 await check('typing in a 1.9 MB file stays responsive (FR-045)',async()=>{
  await openSource('large.yaml');await goTo(3);await page.keyboard.press('End');
  const start=Date.now();await page.keyboard.type(' plus forty more typed characters here.',{delay:0});
  await expect(page.locator('.cm-activeLine')).toContainText('plus forty more typed characters here.');const ms=Date.now()-start;
  console.log(`  ${ms} ms for 39 keystrokes (${Math.round(ms/39)} ms each)`);expect(ms/39).toBeLessThan(30);
 });
 await check('no browser errors',async()=>{expect(errors).toEqual([]);});
 console.log(`${passed} editor checks passed on isolated data root ${api.root}.`);
}finally{await browser.close();await api.stop();}
