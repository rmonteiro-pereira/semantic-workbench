// Rewrites a brand SVG so it can only draw. Anything that could run script, load another
// resource or reach outside the image is removed, and the result is built again from the parsed
// tree instead of being edited as text. The route also serves SVGs under a strict policy, so
// this is the second of two layers.
import {
  DOMParser,
  XMLSerializer,
  type Attr as XmlAttribute,
  type Document as XmlDocument,
  type Element as XmlElement,
} from '@xmldom/xmldom';
import { hasForbiddenValue } from './css-values';
import { BrandFileError } from './files';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

// Elements that draw or describe a drawing. Scripts, foreignObject, animation, links and
// embedded documents are not here, so they are removed together with everything inside them.
const DRAWING_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'title',
  'desc',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'style',
  'image',
]);

const RASTER_DATA_URI = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

function isSafeValue(value: string): boolean {
  return !hasForbiddenValue(value, { allowLocalUrl: true });
}

// Namespace declarations and xml:space are the only namespaced attributes a drawing needs.
function isHarmlessNamespaced(attribute: XmlAttribute): boolean {
  if (attribute.namespaceURI === XMLNS_NAMESPACE) return true;
  return attribute.namespaceURI === XML_NAMESPACE && attribute.localName === 'space';
}

function isSafeLink(elementName: string, value: string): boolean {
  if (value.startsWith('#')) return true;
  return elementName === 'image' && RASTER_DATA_URI.test(value);
}

// A link is decided by its local name, so a prefix bound to any namespace cannot hide an href.
function keepsAttribute(elementName: string, attribute: XmlAttribute): boolean {
  if (attribute.localName?.toLowerCase() === 'href') {
    return isSafeLink(elementName, attribute.value.trim());
  }
  if (attribute.namespaceURI && !isHarmlessNamespaced(attribute)) return false;
  if (attribute.name.toLowerCase().startsWith('on')) return false;
  return isSafeValue(attribute.value);
}

function cleanAttributes(element: XmlElement): void {
  const attributes = Array.from(element.attributes);
  for (const attribute of attributes) {
    if (!keepsAttribute(element.localName ?? element.nodeName, attribute)) {
      element.removeAttribute(attribute.name);
    }
  }
}

function styleText(element: XmlElement): string {
  return Array.from(element.childNodes)
    .map(child => child.textContent ?? '')
    .join('');
}

function isAllowed(element: XmlElement): boolean {
  if (element.namespaceURI !== SVG_NAMESPACE) return false;
  if (!DRAWING_ELEMENTS.has(element.localName ?? '')) return false;
  if (element.localName === 'style') return isSafeValue(styleText(element));
  return true;
}

function cleanChildren(parent: XmlElement): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === ELEMENT_NODE) {
      const element = child as XmlElement;
      if (!isAllowed(element)) {
        parent.removeChild(child);
        continue;
      }
      cleanAttributes(element);
      cleanChildren(element);
    } else if (child.nodeType !== TEXT_NODE && child.nodeType !== CDATA_NODE) {
      parent.removeChild(child);
    }
  }
}

function parseSvg(text: string): XmlDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new BrandFileError('a DOCTYPE or entity declaration is not allowed in an SVG.');
  }
  const notWellFormed = new BrandFileError('the SVG is not well-formed XML.');
  const parser = new DOMParser({
    onError: level => {
      if (level !== 'warning') throw notWellFormed;
    },
  });
  let document: XmlDocument;
  try {
    document = parser.parseFromString(text, 'image/svg+xml');
  } catch {
    throw notWellFormed;
  }
  if (!document.documentElement) throw notWellFormed;
  return document;
}

/** Returns the SVG with scripts, foreign content, handlers and outside references removed. */
export function sanitizeSvg(text: string): string {
  const document = parseSvg(text);
  const root = document.documentElement;
  if (!root) throw new BrandFileError('the SVG has no root element.');
  if (root.localName !== 'svg') throw new BrandFileError('the file is not an SVG image.');
  if (root.namespaceURI !== SVG_NAMESPACE) {
    throw new BrandFileError(`the SVG must declare xmlns="${SVG_NAMESPACE}".`);
  }
  cleanAttributes(root);
  cleanChildren(root);
  return new XMLSerializer().serializeToString(root);
}
