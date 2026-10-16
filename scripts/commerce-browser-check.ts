import{chromium}from'@playwright/test';import{inspect}from'../src/model';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let docs:any[]=[];
await page.route('**/api/documents',async route=>{if(route.request().method()==='GET')return route.fulfill({json:docs});const body=route.request().postDataJSON();inspect(body.source,body.filename);const doc={...body,id:body.filename,revision:1};docs.push(doc);return route.fulfill({json:doc});});
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('button',{name:/Load commerce workspace/}).click();await page.getByRole('status').filter({hasText:'Loaded commerce contracts'}).waitFor({timeout:60000});
if(docs.length!==7)throw Error(`Expected 7 documents, got ${docs.length}`);
for(const [filename,kind]of [['commerce.odcs.yaml','ODCS'],['sales.ossie.yaml','Ossie semantic'],['commerce-business.ossie.yaml','Ossie ontology'],['commerce.owl.ttl','OWL'],['commerce.owl','OWL'],['commerce.shacl.ttl','SHACL'],['commerce-data.ttl','RDF']]){
 await page.getByRole('button',{name:filename,exact:true}).click();await page.locator('.heading .badge').filter({hasText:kind}).waitFor();await page.waitForTimeout(400);
 if(await page.locator('.react-flow__node').count()===0)throw Error(`No nodes for ${filename}`);
 await page.screenshot({path:`/tmp/commerce-${filename.replaceAll('.','-')}.png`});
}
await page.getByRole('button',{name:/Load commerce scale data/}).click();await page.getByText('1000 entities · 5000 relationships',{exact:true}).waitFor({timeout:60000});await page.waitForTimeout(500);
const visible=await page.locator('.react-flow__node').count();if(visible>16||visible===0)throw Error(`Bad neighborhood size ${visible}`);
await page.screenshot({path:'/tmp/commerce-scale.png'});
await page.getByPlaceholder('Find an entity…').fill('Order 10199');await page.waitForTimeout(500);if(await page.locator('.react-flow__node').count()===0)throw Error('Search did not find order');
for(const [name,example] of [['uploaded.rdf','commerce.owl'],['uploaded.shacl','commerce.shacl.ttl'],['uploaded.nt',null]]) {
 const buffer=example?await Bun.file('public/examples/commerce/'+example).arrayBuffer():new TextEncoder().encode('<https://example.org/a> <https://example.org/link> <https://example.org/b> .\n<https://example.org/b> <http://www.w3.org/2000/01/rdf-schema#label> "B" .').buffer;
 await page.locator('input[type=file]').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(buffer)});
 await page.getByRole('button',{name,exact:true}).waitFor();await page.waitForTimeout(200);
 if(!docs.some(d=>d.filename===name))throw Error(`Upload failed: ${name}`);
}
console.log(JSON.stringify({exampleDocuments:docs.length,scale:'1000/5000',visibleNodes:visible,errors}));if(errors.length)throw Error(errors.join('\n'));await browser.close();
