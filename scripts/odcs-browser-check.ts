import{chromium,expect,type Page}from'@playwright/test';import{readFileSync}from'node:fs';import{parse}from'yaml';
import{startIsolatedApi,routeApi}from'./helpers/isolated-api';import{projectDir,projectFile}from'../server/projects/paths';
// Phase 9 browser check (T144; SC-011, FR-056–FR-058): the ODCS contract overview and Marquez-style
// dataset pages (Schema, Lineage, History, Quality) for the commerce, mall and UBL contracts, and
// in-place property edits that change only the edited value. Isolated data root; screenshots in
// /tmp/workbench-odcs-*.png.
const api=await startIsolatedApi();
const commerce=await api.ws.loadExample('commerce'),mall=await api.ws.loadExample('mall'),ubl=await api.ws.loadExample('ubl');
const git=async(slug:string,args:string[])=>(await api.ws.git.run(projectDir(api.ws.layout,slug),args)).stdout;
const read=(slug:string,path:string)=>readFileSync(projectFile(api.ws.layout,slug,path),'utf8');
// Two committed edits to the commerce contract, for History.
async function commitEdit(change:(text:string)=>string,message:string){const f=api.ws.readFile(commerce.slug,'commerce.odcs.yaml');await api.ws.saveFile(commerce.slug,'commerce.odcs.yaml',{baseHash:f.hash,source:change(f.source)});await git(commerce.slug,['commit','-qam',message]);}
await commitEdit(t=>t.replace('version: 1.0.0','version: 1.1.0').replace('        description: Order amount.','        description: Order amount in USD.'),'Describe amount');
await commitEdit(t=>t.replace('version: 1.1.0','version: 1.2.0').replace('      - name: status\n        logicalType: string\n        required: true\n        description: Order status.\n','      - name: status\n        logicalType: string\n        required: true\n        description: Order status.\n      - name: currency\n        logicalType: string\n        required: false\n        description: ISO currency code.\n'),'Add currency');
const browser=await chromium.launch();const errors:string[]=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
await routeApi(page,api);
let passed=0;async function check(name:string,run:()=>Promise<void>){const t=Date.now();await run();passed++;console.log('PASS',name,`(${((Date.now()-t)/1000).toFixed(1)} s)`);}
const tree=(p:Page=page)=>p.getByRole('tree',{name:'Projects'});
async function openFile(path:string,project:string){await tree().getByRole('treeitem',{name:project}).getByRole('button',{name:path,exact:true}).click();await expect(page.locator('h1')).not.toHaveText('Semantic Workbench');}
const contractTab=()=>page.locator('.tabs').getByRole('button',{name:'Contract'});
const overview=()=>page.getByRole('region',{name:'Contract overview'});
const dataset=(name:string)=>page.getByRole('region',{name:`Dataset ${name}`});
async function openDataset(name:string){await overview().getByRole('button',{name:`Open ${name}`,exact:true}).click();await expect(dataset(name)).toBeVisible();}
const views=(name:string)=>dataset(name).getByRole('tablist',{name:'Asset views'});
const noHorizontalScroll=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
try{
 await page.goto(process.env.UI_URL??'http://127.0.0.1:5173/');
 await check('contract overview: identity, status, team, and a searchable object list with counts',async()=>{
  await openFile('commerce.odcs.yaml','Commerce workspace');await contractTab().click();
  const o=overview();await expect(o).toBeVisible();
  await expect(o.getByRole('heading',{level:2})).toHaveText('Commerce warehouse contract');
  for(const fact of ['1.2.0','active','Commerce','Sales analytics','v3.1.0'])await expect(o).toContainText(fact);
  await expect(o.getByRole('region',{name:'Team and roles'})).toContainText('commerce-data');await expect(o.getByRole('region',{name:'Team and roles'})).toContainText('owner');
  const table=o.getByRole('table',{name:'Schema objects'});await expect(table.getByRole('row')).toHaveCount(5);
  const orders=table.getByRole('row').filter({hasText:'analytics.commerce.orders'});
  await expect(orders).toContainText('6');// properties after the "Add currency" commit
  await expect(orders.getByRole('cell').nth(4)).toContainText('1 PK');await expect(orders.getByRole('cell').nth(4)).toContainText('1 FK');
  await o.getByRole('searchbox',{name:'Find an object'}).fill('line');await expect(table.getByRole('row')).toHaveCount(2);await expect(table).toContainText('order_lines');
  await o.getByRole('searchbox',{name:'Find an object'}).fill('');
  await page.screenshot({path:'/tmp/workbench-odcs-overview.png'});
 });
 await check('dataset page header and Schema tab: every property with type, flags and keys; sortable, filterable, foreign keys link to their target',async()=>{
  await openDataset('orders');const d=dataset('orders');
  await expect(d.getByRole('heading',{level:2})).toHaveText('orders');
  const header=d.getByRole('group',{name:'Dataset facts'});
  for(const fact of ['table','6 properties','0 quality rules','Add currency'])await expect(header).toContainText(fact);
  // v0.3.0 asset page tabs (FR-011): Properties is the v0.2.0 Schema table and opens first.
  expect(await views('orders').getByRole('tab').allTextContents()).toEqual(['Lineage','Relationships','Data Quality','Properties','History']);
  await expect(views('orders').getByRole('tab',{name:'Properties'})).toHaveAttribute('aria-selected','true');
  const table=d.getByRole('table',{name:'Properties'});
  const headers=await table.getByRole('columnheader').allTextContents();
  for(const h of ['Name','Logical type','Physical type','Required','Unique','Primary key','Classification','Description','Tags','Foreign keys'])expect(headers.some(x=>x.includes(h))).toBe(true);
  await expect(table.getByRole('row')).toHaveCount(7);
  const id=table.getByRole('row').filter({hasText:'order_id'}).first();await expect(id.getByRole('cell').nth(1).getByRole('combobox')).toHaveValue('integer');
  await expect(id.getByLabel('Primary key of order_id')).toBeChecked();await expect(id.getByLabel('Required of order_id')).toBeChecked();await expect(table.getByLabel('Primary key of amount')).not.toBeChecked();
  const names=async()=>(await table.getByRole('row').locator('td:first-child').allTextContents()).map(s=>s.trim());
  expect(await names()).toEqual(['order_id','customer_id','order_date','amount','status','currency']);
  await table.getByRole('button',{name:'Sort by Name'}).click();expect(await names()).toEqual(['amount','currency','customer_id','order_date','order_id','status']);
  await table.getByRole('button',{name:'Sort by Name'}).click();expect(await names()).toEqual(['status','order_id','order_date','customer_id','currency','amount']);
  await d.getByRole('searchbox',{name:'Filter properties'}).fill('date');expect(await names()).toEqual(['order_date']);await d.getByRole('searchbox',{name:'Filter properties'}).fill('');
  await page.screenshot({path:'/tmp/workbench-odcs-schema.png'});
  await table.getByRole('row').filter({hasText:'customer_id'}).getByRole('button',{name:'Open customers'}).click();
  await expect(dataset('customers')).toBeVisible();
  await dataset('customers').getByRole('button',{name:'All objects'}).click();await expect(overview()).toBeVisible();
 });
 // v0.3.0: the asset page's Lineage tab hosts the column-level lineage canvas (FR-011).
 await check('Lineage tab: the lineage canvas centred on the object, foreign-key neighbours, the sales metrics; property lineage; Relationships',async()=>{
  await openDataset('orders');await views('orders').getByRole('tab',{name:'Lineage'}).click();
  const graph=dataset('orders').getByRole('region',{name:'Lineage graph'});await expect(graph).toBeVisible();
  // the first view is a readable zoom that may leave outer cards off screen; Fit shows them all
  await expect(graph.locator('.lineage-card.center')).toBeVisible({timeout:8000});await graph.getByRole('button',{name:'Fit'}).click();await page.waitForTimeout(300);
  for(const name of ['Contract object orders','Contract object customers','Contract object order_lines','Semantic dataset orders'])await expect(graph.getByRole('group',{name}).first()).toBeVisible({timeout:8000});
  await expect(graph.locator('.lineage-card.k-metric')).toHaveCount(3);
  await expect(graph.getByRole('group',{name:'Contract object orders'})).toHaveClass(/center/);
  const props=dataset('orders').getByRole('table',{name:'Property lineage'});
  await expect(props.getByRole('row').filter({hasText:'amount'})).toContainText('gross_revenue');await expect(props.getByRole('row').filter({hasText:'amount'})).toContainText('orders.amount');
  await page.screenshot({path:'/tmp/workbench-odcs-lineage.png'});
  await views('orders').getByRole('tab',{name:'Relationships'}).click();
  const rel=dataset('orders').getByRole('table',{name:'Relationships'});
  await expect(rel.getByRole('row').filter({hasText:'customer_id'})).toContainText('references');await expect(rel.getByRole('row').filter({hasText:'customer_id'})).toContainText('customers');
  await expect(rel.getByRole('row').filter({hasText:'order_lines'})).toContainText('referenced by');
 });
 await check('History tab: versions from Git with property-level changes between two versions',async()=>{
  await views('orders').getByRole('tab',{name:'History'}).click();
  const versions=dataset('orders').getByRole('table',{name:'Versions'});
  await expect(versions.getByRole('row')).toHaveCount(4);// header + 3 commits touching the contract
  await expect(versions).toContainText('Add currency');await expect(versions).toContainText('1.2.0');await expect(versions).toContainText('Workbench Test');
  const log=(await git(commerce.slug,['log','--format=%H %s','--','commerce.odcs.yaml'])).trim().split('\n').map(l=>({commit:l.slice(0,40),message:l.slice(41)}));
  await dataset('orders').getByLabel('From version').selectOption(log.at(-1)!.commit);await dataset('orders').getByLabel('To version').selectOption(log[0].commit);
  const changes=dataset('orders').getByRole('region',{name:'Changes between versions'});
  await expect(changes).toContainText('currency');await expect(changes).toContainText('added');
  await expect(changes).toContainText('amount');await expect(changes).toContainText('Order amount in USD.');
  await dataset('orders').getByLabel('From version').selectOption(log[1].commit);
  await expect(changes).not.toContainText('Order amount in USD.');await expect(changes).toContainText('currency');
  await page.screenshot({path:'/tmp/workbench-odcs-history.png'});
 });
 await check('Quality tab (mall): rules as declared, with dimension, severity and thresholds; nothing is run',async()=>{
  await openFile('mall.odcs.yaml','Shopping center administration');await contractTab().click();
  const withRules=parse(read(mall.slug,'mall.odcs.yaml')).schema.filter((o:any)=>o.quality||o.properties?.some((p:any)=>p.quality));
  expect(withRules.length).toBeGreaterThan(0);
  const target=withRules[0].name;await overview().getByRole('searchbox',{name:'Find an object'}).fill(target);await openDataset(target);
  await views(target).getByRole('tab',{name:'Data Quality'}).click();
  const rules=dataset(target).getByRole('table',{name:'Quality rules'});await expect(rules.getByRole('row').nth(1)).toBeVisible();
  const declared=[...(withRules[0].quality??[]),...withRules[0].properties.flatMap((p:any)=>p.quality??[])];
  await expect(rules.getByRole('row')).toHaveCount(declared.length+1);
  if(declared[0].dimension)await expect(rules).toContainText(declared[0].dimension);
  await expect(dataset(target)).toContainText('does not run');
  await expect(rules).toContainText('nullValues');await expect(rules).toContainText('completeness');await expect(rules).toContainText('error');
  await dataset(target).getByRole('button',{name:'All objects'}).click();await expect(overview().getByRole('region',{name:'Service levels'})).toContainText('latency');await expect(overview().getByRole('region',{name:'Service levels'})).toContainText('retention');
  await page.screenshot({path:'/tmp/workbench-odcs-quality.png'});
 });
 await check('UBL: 169 objects stay searchable and a dataset page opens quickly',async()=>{
  await openFile('ubl.odcs.yaml','UBL business model');await contractTab().click();
  const table=overview().getByRole('table',{name:'Schema objects'});await expect(table.getByRole('row')).toHaveCount(170);
  const t=Date.now();await overview().getByRole('searchbox',{name:'Find an object'}).fill('invoice');await expect(table.getByRole('row').nth(1)).toContainText(/invoice/i);
  expect(Date.now()-t).toBeLessThan(1500);
  const first=(await table.getByRole('row').nth(1).locator('td').first().textContent())!.trim();
  await openDataset(first);await expect(dataset(first).getByRole('table',{name:'Properties'})).toBeVisible();
  await page.screenshot({path:'/tmp/workbench-odcs-ubl.png'});
 });
 await check('narrow screens: overview and dataset page fit at 390 px without horizontal page scroll',async()=>{
  await page.setViewportSize({width:390,height:844});await noHorizontalScroll();
  await page.screenshot({path:'/tmp/workbench-odcs-narrow.png'});
  await page.setViewportSize({width:1440,height:900});
 });
 await check('in-place property edits change only the edited value and are saved against the base hash',async()=>{
  await git(commerce.slug,['commit','-qam','before edits','--allow-empty']);
  await openFile('commerce.odcs.yaml','Commerce workspace');await contractTab().click();await openDataset('orders');
  const table=dataset('orders').getByRole('table',{name:'Properties'});
  const diff=async()=>{const d=await git(commerce.slug,['diff','-U0','--','commerce.odcs.yaml']);return {removed:d.split('\n').filter(l=>/^-(?!--)/.test(l)).map(l=>l.slice(1)),added:d.split('\n').filter(l=>/^\+(?!\+\+)/.test(l)).map(l=>l.slice(1))};};
  await table.getByLabel('Required of status').uncheck();
  await expect.poll(diff).toEqual({removed:['        required: true'],added:[]});
  await expect(page.locator('main > .status')).toContainText('Saved required of status');
  const desc=table.getByLabel('Description of amount');await desc.fill('Order total in USD, after discounts.');await desc.press('Enter');
  await expect.poll(diff).toEqual({removed:['        description: Order amount in USD.','        required: true'],added:['        description: Order total in USD, after discounts.']});
  // Wait until the page has the saved version's hash before the next edit (the file on disk can
  // change before the save response arrives; an edit in between is correctly refused as stale).
  await expect(page.locator('main > .status')).toContainText('Saved description of amount');
  await table.getByLabel('Logical type of currency').selectOption('date');
  await expect.poll(async()=>(await diff()).added).toContain('        logicalType: date');
  await table.getByLabel('Classification of customer_id').fill('internal');await table.getByLabel('Classification of customer_id').press('Enter');
  await expect.poll(async()=>(await diff()).added).toContain('        classification: internal');
  // Escape restores the value without saving.
  const before=read(commerce.slug,'commerce.odcs.yaml');await desc.fill('Discarded');await desc.press('Escape');await expect(desc).toHaveValue('Order total in USD, after discounts.');expect(read(commerce.slug,'commerce.odcs.yaml')).toBe(before);
  await page.screenshot({path:'/tmp/workbench-odcs-edit.png'});
  // The History tab sees the saved edits once committed.
  await git(commerce.slug,['commit','-qam','Edit orders in place']);await views('orders').getByRole('tab',{name:'History'}).click();
  await expect(dataset('orders').getByRole('region',{name:'Changes between versions'})).toContainText('classification');
 });
 await check('no browser errors',async()=>{expect(errors).toEqual([]);});
 console.log(`${passed} ODCS checks passed on isolated data root ${api.root}.`);
}finally{await browser.close();await api.stop();}
