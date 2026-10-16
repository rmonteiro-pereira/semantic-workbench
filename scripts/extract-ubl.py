"""Extract a focused UBL 2.3 business model from authoritative XSDs."""
import xml.etree.ElementTree as ET
import urllib.request,json,pathlib
base='https://docs.oasis-open.org/ubl/os-UBL-2.3/xsd/'
cache=pathlib.Path('/tmp/semantic-workbench-ubl');cache.mkdir(exist_ok=True)
ns={'xs':'http://www.w3.org/2001/XMLSchema'}
def load(path):
    target=cache/pathlib.Path(path).name
    if not target.exists(): urllib.request.urlretrieve(base+path,target)
    return ET.parse(target).getroot()
cac=load('common/UBL-CommonAggregateComponents-2.3.xsd')
types={x.get('name'):x for x in cac.findall('xs:complexType',ns)}
elements={x.get('name'):x.get('type').split(':')[-1].removesuffix('Type') for x in cac.findall('xs:element',ns)}
roots=['Order','Invoice','DespatchAdvice','ReceiptAdvice','CreditNote']
components=['Party','CustomerParty','SupplierParty','Person','Contact','Address','Location','Country','Item','CommodityClassification','OrderLine','LineItem','Delivery','Shipment','Consignment','TransportHandlingUnit','TransportEquipment','GoodsItem','InvoiceLine','CreditNoteLine','PaymentMeans','PaymentTerms','FinancialAccount','FinancialInstitution','Branch','TaxTotal','TaxSubtotal','TaxCategory','TaxScheme','Price','AllowanceCharge','Contract','DocumentReference','ReceiptLine','DespatchLine','TransportationService','TransportMeans','OrderReference','BillingReference','MonetaryTotal']
chosen=roots+components
assert len(chosen)==45
model=[]
for name in chosen:
    path=f'maindoc/UBL-{name}-2.3.xsd' if name in roots else 'common/UBL-CommonAggregateComponents-2.3.xsd'
    node=load(path).find(f"xs:complexType[@name='{name}Type']",ns) if name in roots else types[name+'Type']
    fields=[];relationships=[]
    for el in node.findall('.//xs:sequence/xs:element',ns):
        ref=el.get('ref','');prefix,_,role=ref.partition(':')
        meta={'name':role,'min':int(el.get('minOccurs','1')),'max':el.get('maxOccurs','1'),'ref':ref}
        if prefix=='cac':
            target=elements.get(role)
            if target in chosen: relationships.append(dict(meta,target=target))
        elif prefix=='cbc':fields.append(meta)
    model.append({'name':name,'source':base+path+'#'+name+'Type','fields':fields,'relationships':relationships})
result={'name':'UBL 2.3 procurement-to-payment','source':base,'entities':model,'omitted':'Focused projection: UBL components outside the 45 selected types are not expanded. Complete original definitions remain at source URLs.'}
pathlib.Path('public/examples/ubl/model-map.json').write_text(json.dumps(result,indent=2))
print(len(model),'business entities;',sum(len(e['relationships']) for e in model),'schema-derived relationships')
