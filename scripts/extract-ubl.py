"""Extract a focused UBL 2.3 business model from authoritative XSDs."""

import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

BASE_URL = "https://docs.oasis-open.org/ubl/os-UBL-2.3/xsd/"
COMMON_COMPONENTS = "common/UBL-CommonAggregateComponents-2.3.xsd"
CACHE_DIR = pathlib.Path("/tmp/semantic-workbench-ubl")
CACHE_DIR.mkdir(exist_ok=True)
NAMESPACES = {"xs": "http://www.w3.org/2001/XMLSchema"}

ROOT_DOCUMENTS = ["Order", "Invoice", "DespatchAdvice", "ReceiptAdvice", "CreditNote"]
COMPONENTS = [
    "Party",
    "CustomerParty",
    "SupplierParty",
    "Person",
    "Contact",
    "Address",
    "Location",
    "Country",
    "Item",
    "CommodityClassification",
    "OrderLine",
    "LineItem",
    "Delivery",
    "Shipment",
    "Consignment",
    "TransportHandlingUnit",
    "TransportEquipment",
    "GoodsItem",
    "InvoiceLine",
    "CreditNoteLine",
    "PaymentMeans",
    "PaymentTerms",
    "FinancialAccount",
    "FinancialInstitution",
    "Branch",
    "TaxTotal",
    "TaxSubtotal",
    "TaxCategory",
    "TaxScheme",
    "Price",
    "AllowanceCharge",
    "Contract",
    "DocumentReference",
    "ReceiptLine",
    "DespatchLine",
    "TransportationService",
    "TransportMeans",
    "OrderReference",
    "BillingReference",
    "MonetaryTotal",
]
OMITTED_NOTE = (
    "Focused projection: UBL components outside the 45 selected types are not expanded. "
    "Complete original definitions remain at source URLs."
)


def load(path):
    """Downloads an XSD once into the cache directory and returns its parsed root."""
    target = CACHE_DIR / pathlib.Path(path).name
    if not target.exists():
        urllib.request.urlretrieve(BASE_URL + path, target)
    return ET.parse(target).getroot()


common = load(COMMON_COMPONENTS)
types = {x.get("name"): x for x in common.findall("xs:complexType", NAMESPACES)}
elements = {
    x.get("name"): x.get("type").split(":")[-1].removesuffix("Type")
    for x in common.findall("xs:element", NAMESPACES)
}
chosen = ROOT_DOCUMENTS + COMPONENTS
assert len(chosen) == 45

model = []
for name in chosen:
    is_root = name in ROOT_DOCUMENTS
    path = f"maindoc/UBL-{name}-2.3.xsd" if is_root else COMMON_COMPONENTS
    if is_root:
        node = load(path).find(f"xs:complexType[@name='{name}Type']", NAMESPACES)
    else:
        node = types[name + "Type"]
    fields = []
    relationships = []
    for element in node.findall(".//xs:sequence/xs:element", NAMESPACES):
        reference = element.get("ref", "")
        prefix, _, role = reference.partition(":")
        meta = {
            "name": role,
            "min": int(element.get("minOccurs", "1")),
            "max": element.get("maxOccurs", "1"),
            "ref": reference,
        }
        if prefix == "cac":
            target = elements.get(role)
            if target in chosen:
                relationships.append(dict(meta, target=target))
        elif prefix == "cbc":
            fields.append(meta)
    model.append(
        {
            "name": name,
            "source": BASE_URL + path + "#" + name + "Type",
            "fields": fields,
            "relationships": relationships,
        }
    )

result = {
    "name": "UBL 2.3 procurement-to-payment",
    "source": BASE_URL,
    "entities": model,
    "omitted": OMITTED_NOTE,
}
pathlib.Path("public/examples/ubl/model-map.json").write_text(json.dumps(result, indent=2))
print(
    len(model),
    "business entities;",
    sum(len(entity["relationships"]) for entity in model),
    "schema-derived relationships",
)
