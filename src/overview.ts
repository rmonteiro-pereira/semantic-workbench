import type {Entity,Relationship}from'./model';
const areas=[
 {id:'documents',name:'Business documents',description:'Procurement, invoicing and evidence',color:'#417fa8',names:['Order','Invoice','DespatchAdvice','ReceiptAdvice','CreditNote','OrderReference','BillingReference','DocumentReference','Contract']},
 {id:'parties',name:'Trading parties',description:'Buyers, suppliers and people',color:'#9165ad',names:['Party','CustomerParty','SupplierParty','Person','Contact']},
 {id:'lines',name:'Document lines',description:'Line-level commitments and quantities',color:'#478a87',names:['OrderLine','LineItem','InvoiceLine','CreditNoteLine','ReceiptLine','DespatchLine']},
 {id:'products',name:'Products & pricing',description:'What is traded and how it is priced',color:'#b28546',names:['Item','CommodityClassification','Price','AllowanceCharge']},
 {id:'fulfillment',name:'Fulfillment & transport',description:'Delivery, cargo and movement',color:'#568866',names:['Delivery','Shipment','Consignment','TransportHandlingUnit','TransportEquipment','GoodsItem','TransportationService','TransportMeans']},
 {id:'tax',name:'Tax & totals',description:'Tax calculation and monetary totals',color:'#ab6d64',names:['TaxTotal','TaxSubtotal','TaxCategory','TaxScheme','MonetaryTotal']},
 {id:'payment',name:'Payment & finance',description:'Settlement, terms and banking',color:'#6884ad',names:['PaymentMeans','PaymentTerms','FinancialAccount','FinancialInstitution','Branch']},
 {id:'places',name:'Places',description:'Addresses and geographical context',color:'#9a8870',names:['Address','Location','Country']},
];
const normalize=(name:string)=>name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
const byName=new Map(areas.flatMap(area=>area.names.map(name=>[normalize(name),area]as const)));
export function modelOverview(entities:Entity[],edges:Relationship[],name:string,technical=false){
 const hasClasses=entities.some(e=>e.kind==='OWL class');
 const visible=hasClasses&&!technical?entities.filter(e=>e.kind==='OWL class'):entities;
 const ids=new Set(visible.map(e=>e.id));const links=edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
 const groups=new Map<string,{id:string;name:string;description:string;color:string;entities:Entity[]}>();
 for(const entity of visible){
  let area=undefined;
  if(name.includes('UBL')){let key=normalize(entity.name.split('__')[0]);if(key==='purchaseorder')key='order';area=byName.get(key);}
  const fallback={id:entity.kind,name:entity.kind,description:'Grouped by definition type',color:'#658b80'};
  const group=area??fallback;
  if(!groups.has(group.id))groups.set(group.id,{id:group.id,name:group.name,description:group.description,color:group.color,entities:[]});
  groups.get(group.id)!.entities.push(entity);
 }
 const order=areas.map(a=>a.id);
 const ordered=[...groups.values()].sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?99:ai)-(bi<0?99:bi)||a.name.localeCompare(b.name)});
 const groupOf=new Map(ordered.flatMap(g=>g.entities.map(e=>[e.id,g.id]as const)));
 const degree=new Map(visible.map(e=>[e.id,0]));
 const matrix=new Map<string,Relationship[]>();
 for(const edge of links){degree.set(edge.source,degree.get(edge.source)!+1);if(edge.target!==edge.source)degree.set(edge.target,degree.get(edge.target)!+1);const key=JSON.stringify([groupOf.get(edge.source),groupOf.get(edge.target)]);const group=matrix.get(key)??[];group.push(edge);matrix.set(key,group);}
 return {groups:ordered,entities:visible,links,matrix,degree,groupOf,technicalCount:entities.length-visible.length};
}
