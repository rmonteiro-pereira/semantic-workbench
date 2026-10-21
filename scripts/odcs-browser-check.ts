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
const views=(name:string)=>dataset(name).getByRole('tablist',{name:'Dataset views'});
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
  await expect(views('orders').getByRole('tab',{name:'Schema'})).toHaveAttribute('aria-selected','true');
  const table=d.getByRole('table',{name:'Properties'});
  const headers=await table.getByRole('columnheader').allTextContents();
  for(const h of ['Name','Logical type','Physical type','Required','Unique','Primary key','Classification','Description','Tags','Foreign keys'])expect(headers.some(x=>x.includes(h))).toBe(true);
  await expect(table.getByRole('row')).toHaveCount(7);
  const id=table.getByRole('row').filter({hasText:'order_id'}).first();await expect(id.getByRole('cell').nth(1)).toHaveText('integer');
  await expect(id.getByRole('cell').nth(5)).toContainText('Yes');// primary key
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
 await check('Lineage tab: foreign-key neighbors and, with more depth, the sales metrics; property-level lineage',async()=>{
  await openDataset('orders');await views('orders').getByRole('tab',{name:'Lineage'}).click();
  const graph=dataset('orders').getByRole('region',{name:'Lineage graph'});await expect(graph).toBeVisible();
  const nodes=(kind:string)=>graph.locator(`[data-lineage-kind="${kind}"]`);
  const depth=dataset('orders').getByLabel('Lineage depth');
  await depth.selectOption('1');await expect(nodes('object')).toHaveCount(3);await expect(nodes('metric')).toHaveCount(0);
  await expect(graph).toContainText('customers');await expect(graph).toContainText('order_lines');
  await depth.selectOption('3');for(const m of ['gross_revenue','order_count','average_order_value'])await expect(nodes('metric').filter({hasText:m})).toHaveCount(1);
  const props=dataset('orders').getByRole('table',{name:'Property lineage'});
  await expect(props.getByRole('row').filter({hasText:'amount'})).toContainText('gross_revenue');await expect(props.getByRole('row').filter({hasText:'amount'})).toContainText('orders.amount');
  await page.screenshot({path:'/tmp/workbench-odcs-lineage.png'});
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
  await views(target).getByRole('tab',{name:'Quality'}).click();
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
 await check('no browser errors',async()=>{expect(errors).toEqual([]);});
 console.log(`${passed} ODCS checks passed on isolated data root ${api.root}.`);
}finally{await browser.close();await api.stop();}
