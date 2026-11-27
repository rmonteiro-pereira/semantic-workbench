/**
 * The explicit, reviewed conversion of one Ossie 0.2.0.dev0 document to the 0.3.0 draft base. It
 * changes the declared version, renames `custom_extensions` to `nonportable_extensions` and turns
 * each entry's JSON-string `data` into an object. A workbench metric's legacy `draft` status becomes
 * `proposed`; nothing ever becomes `approved`. Every change is listed for the preview, and the
 * converted text carries a hash so the confirmation applies exactly what was shown.
 */
import { isMap, isScalar, isSeq, parseDocument, type Document, type Node, type Pair } from 'yaml';
import { METRIC_SCHEMA, VENDOR } from '../metrics/extension';
import { OSSIE_DRAFT_VERSION } from '../validation/ossie-version';
import { sha256Hex } from './digest';

/** The version a convertible document declares. It gets the draft base's version. */
const CONVERSION_SOURCE = '0.2.0.dev0';
const CONVERSION_TARGET = OSSIE_DRAFT_VERSION;

/** How a legacy workbench status is renamed. A status that is not listed stays as it is. */
const LEGACY_STATUS: Readonly<Record<string, string>> = { draft: 'proposed' };

/** One change the conversion makes, at a JSON pointer of the original document. */
export type BaseConversionChange = { pointer: string; kind: 'version' | 'extension-list' | 'extension-data' | 'metric-status'; before: unknown; after: unknown };

/** The converted text, every change it holds, and the hash the confirmation must name. */
export type BaseConversion = { text: string; changes: BaseConversionChange[]; sha256: string };

/** Why a document cannot be converted. */
export type BaseConversionRefusalCode = 'not-convertible' | 'unreadable-extension' | 'would-approve';

/** A conversion that was not made, with the reason and where. */
export class BaseConversionRefusal extends Error {
  constructor(
    readonly code: BaseConversionRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'BaseConversionRefusal';
  }
}

type Path = (string | number)[];
/** One conversion in progress: the document being changed, the status renames and the changes so far. */
type ConversionRun = { document: Document; statusMap: Readonly<Record<string, string>>; changes: BaseConversionChange[] };
const encoder = new TextEncoder();
const pointerOf = (path: Path) => '/' + path.map(part => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');

function pairNamed(node: unknown, key: string): Pair<Node, Node> | undefined {
  if (!isMap(node)) return undefined;
  return (node.items as Pair<Node, Node>[]).find(pair => isScalar(pair.key) && pair.key.value === key);
}

/** Reads a 0.2 entry's data, which must be a JSON object, or refuses with its place. */
function entryData(data: unknown, path: Path): Record<string, unknown> {
  let value: unknown;
  try {
    value = typeof data === 'string' ? JSON.parse(data) : undefined;
  } catch {
    value = undefined;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new BaseConversionRefusal('unreadable-extension', `The extension data at ${pointerOf(path)} is not a JSON object, so it cannot become 0.3 object data.`);
  return value as Record<string, unknown>;
}

/** Renames a legacy metric status and refuses anything that would turn into an approval. */
function convertedStatus(data: Record<string, unknown>, path: Path, statusMap: Readonly<Record<string, string>>, changes: BaseConversionChange[]): Record<string, unknown> {
  if (data.schema !== METRIC_SCHEMA || typeof data.status !== 'string') return data;
  const after = statusMap[data.status] ?? data.status;
  if (after === data.status) return data;
  if (after === 'approved') throw new BaseConversionRefusal('would-approve', `The conversion would approve the metric at ${pointerOf(path)}. Approval is a reviewed decision, never a conversion.`);
  changes.push({ pointer: pointerOf([...path, 'status']), kind: 'metric-status', before: data.status, after });
  return { ...data, status: after };
}

/** Renames one `custom_extensions` list and turns each entry's data into an object. */
function convertExtensionList(run: ConversionRun, pair: Pair<Node, Node>, path: Path) {
  const { document, statusMap, changes } = run;
  pair.key = document.createNode('nonportable_extensions') as Node;
  changes.push({ pointer: pointerOf([...path, 'custom_extensions']), kind: 'extension-list', before: 'custom_extensions', after: 'nonportable_extensions' });
  if (!isSeq(pair.value)) return;
  pair.value.items.forEach((entry, index) => {
    const dataPair = pairNamed(entry, 'data');
    if (!dataPair) return;
    const entryPath = [...path, 'custom_extensions', index, 'data'];
    const vendor = pairNamed(entry, 'vendor_name');
    const parsed = entryData(isScalar(dataPair.value) ? dataPair.value.value : undefined, entryPath);
    const data = isScalar(vendor?.value) && vendor.value.value === VENDOR ? convertedStatus(parsed, entryPath, statusMap, changes) : parsed;
    dataPair.value = document.createNode(data) as Node;
    changes.push({ pointer: pointerOf(entryPath), kind: 'extension-data', before: 'JSON text', after: 'object' });
  });
}

/** Walks the document, converting every extension list it finds and each version it must change. */
function convertNode(run: ConversionRun, node: unknown, path: Path) {
  const { document, changes } = run;
  if (isSeq(node)) node.items.forEach((item, index) => convertNode(run, item, [...path, index]));
  if (!isMap(node)) return;
  for (const pair of node.items as Pair<Node, Node>[]) {
    if (!isScalar(pair.key)) continue;
    const key = String(pair.key.value);
    const declaresVersion = path.length === 0 || path.at(-1) === 'semantic_model';
    if (key === 'version' && declaresVersion && isScalar(pair.value) && pair.value.value === CONVERSION_SOURCE) {
      pair.value = document.createNode(CONVERSION_TARGET) as Node;
      changes.push({ pointer: pointerOf([...path, 'version']), kind: 'version', before: CONVERSION_SOURCE, after: CONVERSION_TARGET });
    } else if (key === 'custom_extensions') convertExtensionList(run, pair, path);
    else convertNode(run, pair.value, [...path, key]);
  }
}

/** Converts one 0.2.0.dev0 document to the 0.3.0 draft base, or refuses and says why. */
export function convertToDraftBase(source: string, filename: string, statusMap: Readonly<Record<string, string>> = LEGACY_STATUS): BaseConversion {
  const document = parseDocument(source, { uniqueKeys: false });
  if (document.errors.length) throw new BaseConversionRefusal('not-convertible', `${filename} is not valid YAML or JSON.`);
  if (document.get('version') !== CONVERSION_SOURCE)
    throw new BaseConversionRefusal('not-convertible', `Only a document that declares Ossie ${CONVERSION_SOURCE} can be converted to the ${CONVERSION_TARGET} draft base.`);
  const changes: BaseConversionChange[] = [];
  convertNode({ document, statusMap, changes }, document.contents, []);
  const text = /\.json$/i.test(filename) ? JSON.stringify(document.toJS(), null, 2) + '\n' : document.toString();
  return { text, changes, sha256: sha256Hex(encoder.encode(text)) };
}
