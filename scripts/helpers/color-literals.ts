// Finds colour literals in stylesheets and source files, and converts them to numbers. The theme
// check and the theme codemod share it, so both agree on what counts as a literal.

/** One colour literal found in a source text. */
export type ColorLiteral = {
  /** The literal as written, for example `#fff` or `rgba(0, 0, 0, 0.1)`. */
  text: string;
  /** Offset of the first character in the scanned text. */
  index: number;
  /** 1-based line number. */
  line: number;
  /** The CSS property or JSX attribute the literal belongs to, when one is known. */
  property: string;
};

/** The kinds of file the scanner understands. */
export type SourceLanguage = 'css' | 'script' | 'html';

const NAMED_COLORS = [
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
];

const HEX = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\\w-])';
const FUNCTION = '\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(';
const NAMED = `(?<![\\w#.$-])(?:${NAMED_COLORS.join('|')})(?![\\w(-])`;
const VALUE_COLOR = new RegExp(`${HEX}|${FUNCTION}[^)]*\\)|${NAMED}`, 'g');
const SCRIPT_COLOR_FUNCTION = new RegExp(`${FUNCTION}[^)]*\\)`, 'g');
const WHOLE_STRING_HEX = new RegExp(`^${HEX}$`);
const COLOR_PROPERTY =
  /(?:color|fill|stroke|background\w*|border\w*|outline\w*|shadow\w*|stopColor|floodColor)\s*[:=]\s*$/i;

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let at = 0; at < index; at++) if (text.charCodeAt(at) === 10) line++;
  return line;
}

/** Replaces comments with spaces, keeping offsets and line numbers, and leaves strings alone. */
export function blankComments(text: string, language: SourceLanguage): string {
  const out = text.split('');
  const blank = (from: number, to: number) => {
    for (let at = from; at < to; at++) if (out[at] !== '\n') out[at] = ' ';
  };
  const lineComments = language === 'script';
  let at = 0;
  while (at < text.length) {
    const char = text[at];
    const pair = text.slice(at, at + 2);
    if (language === 'html' && text.startsWith('<!--', at)) {
      const end = text.indexOf('-->', at);
      const stop = end < 0 ? text.length : end + 3;
      blank(at, stop);
      at = stop;
    } else if (pair === '/*') {
      const end = text.indexOf('*/', at + 2);
      const stop = end < 0 ? text.length : end + 2;
      blank(at, stop);
      at = stop;
    } else if (lineComments && pair === '//') {
      const end = text.indexOf('\n', at);
      const stop = end < 0 ? text.length : end;
      blank(at, stop);
      at = stop;
    } else if (language !== 'html' && (char === '"' || char === "'" || char === '`')) {
      at = endOfString(text, at);
    } else {
      at++;
    }
  }
  return out.join('');
}

function endOfString(text: string, start: number): number {
  const quote = text[start];
  let at = start + 1;
  while (at < text.length && text[at] !== quote) {
    if (text[at] === '\\') at++;
    else if (quote === '\n') break;
    at++;
  }
  return at + 1;
}

function collect(
  into: ColorLiteral[],
  text: string,
  value: string,
  valueStart: number,
  property: string,
) {
  for (const match of value.matchAll(VALUE_COLOR)) {
    const index = valueStart + match.index;
    into.push({ text: match[0], index, line: lineAt(text, index), property });
  }
}

function cssLiterals(text: string): ColorLiteral[] {
  const found: ColorLiteral[] = [];
  const declaration = /([\w-]+)\s*:\s*([^;{}]+)/g;
  for (const match of text.matchAll(declaration)) {
    const valueEnd = match.index + match[0].length;
    // A declaration ends at a semicolon or a closing brace; a following brace marks a selector.
    if (text[valueEnd] === '{') continue;
    const valueStart = valueEnd - match[2].length;
    collect(found, text, match[2], valueStart, match[1]);
  }
  return found;
}

function scriptStrings(text: string): { start: number; body: string }[] {
  const strings: { start: number; body: string }[] = [];
  let at = 0;
  while (at < text.length) {
    const char = text[at];
    if (char === '"' || char === "'" || char === '`') {
      const end = endOfString(text, at);
      strings.push({ start: at + 1, body: text.slice(at + 1, end - 1) });
      at = end;
    } else {
      at++;
    }
  }
  return strings;
}

function scriptLiterals(text: string): ColorLiteral[] {
  const found: ColorLiteral[] = [];
  for (const { start, body } of scriptStrings(text)) {
    const before = text.slice(Math.max(0, start - 60), start - 1);
    const property = before.match(COLOR_PROPERTY) ? 'script' : '';
    if (WHOLE_STRING_HEX.test(body.trim())) {
      collect(found, text, body, start, property);
    } else if (property && NAMED_COLORS.includes(body.trim())) {
      collect(found, text, body, start, property);
    } else if (/[\w-]\s*:\s*\S/.test(body) && body.includes(';')) {
      found.push(...cssLiterals(body + ';').map(item => shift(item, text, start)));
    } else {
      for (const match of body.matchAll(SCRIPT_COLOR_FUNCTION)) {
        const index = start + match.index;
        found.push({ text: match[0], index, line: lineAt(text, index), property });
      }
    }
  }
  return found;
}

function shift(item: ColorLiteral, text: string, offset: number): ColorLiteral {
  const index = offset + item.index;
  return { ...item, index, line: lineAt(text, index) };
}

function htmlLiterals(text: string): ColorLiteral[] {
  const found: ColorLiteral[] = [];
  const styleBlock = /<style[^>]*>([\s\S]*?)<\/style>/g;
  for (const block of text.matchAll(styleBlock)) {
    const bodyStart = block.index + block[0].indexOf('>') + 1;
    found.push(...cssLiterals(block[1]).map(item => shift(item, text, bodyStart)));
  }
  const attribute = /\b(style|content|fill|stroke|color)="([^"]*)"/g;
  for (const match of text.matchAll(attribute)) {
    const valueStart = match.index + match[0].indexOf('"') + 1;
    const body = match[2];
    const prefix = match[1] === 'style' ? '' : `${match[1]}:`;
    const inner = cssLiterals(prefix + body + ';').map(item =>
      shift(item, text, valueStart - prefix.length),
    );
    found.push(...inner);
  }
  return found;
}

/** Returns every colour literal in `text`, ignoring comments. */
export function findColorLiterals(text: string, language: SourceLanguage): ColorLiteral[] {
  const visible = blankComments(text, language);
  if (language === 'css') return cssLiterals(visible);
  if (language === 'html') return htmlLiterals(visible);
  return scriptLiterals(visible);
}

/** A colour as red, green and blue in 0 to 255 and alpha in 0 to 1. */
export type Rgba = { red: number; green: number; blue: number; alpha: number };

const NAMED_VALUES: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  yellow: '#ffff00',
  purple: '#800080',
};

function hexToRgba(hex: string): Rgba {
  let digits = hex.slice(1);
  if (digits.length <= 4) digits = [...digits].map(digit => digit + digit).join('');
  const channel = (from: number) => parseInt(digits.slice(from, from + 2), 16);
  const alpha = digits.length === 8 ? channel(6) / 255 : 1;
  return { red: channel(0), green: channel(2), blue: channel(4), alpha };
}

function numbersIn(text: string): number[] {
  const inside = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
  return inside
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(part => (part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part)));
}

/** Parses a hex, rgb(), rgba() or basic named colour; returns null for anything else. */
export function parseColor(text: string): Rgba | null {
  const lower = text.trim().toLowerCase();
  if (lower.startsWith('#')) return hexToRgba(lower);
  if (NAMED_VALUES[lower]) return hexToRgba(NAMED_VALUES[lower]);
  if (/^rgba?\(/.test(lower)) {
    const [red, green, blue, alpha = 1] = numbersIn(lower);
    return { red, green, blue, alpha };
  }
  return null;
}

/** Formats a colour as a lowercase six-digit hex, ignoring alpha. */
export function toHex({ red, green, blue }: Rgba): string {
  const part = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return `#${part(red)}${part(green)}${part(blue)}`;
}

function linear(channel: number): number {
  const unit = channel / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a colour. */
export function luminance({ red, green, blue }: Rgba): number {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** WCAG contrast ratio between two opaque colours, from 1 to 21. */
export function contrastRatio(first: Rgba, second: Rgba): number {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
}

const WHITE_POINT = [0.95047, 1, 1.08883];

function labChannel(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

/** The CIE L*a*b* coordinates of an opaque colour. */
export function toLab(color: Rgba): [number, number, number] {
  const red = linear(color.red);
  const green = linear(color.green);
  const blue = linear(color.blue);
  const x = (0.4124 * red + 0.3576 * green + 0.1805 * blue) / WHITE_POINT[0];
  const y = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / WHITE_POINT[1];
  const z = (0.0193 * red + 0.1192 * green + 0.9505 * blue) / WHITE_POINT[2];
  const [fx, fy, fz] = [labChannel(x), labChannel(y), labChannel(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Perceptual distance between two colours (CIE76 delta E; about 2 is barely visible). */
export function colorDistance(first: Rgba, second: Rgba): number {
  const [l1, a1, b1] = toLab(first);
  const [l2, a2, b2] = toLab(second);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Runs in the page: resolves a theme colour token such as `--color-focus` to the colour drawn. */
export function tokenColour(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}
