// Prints a document after the compiler removed the marker and the additions, then reads the text back so the caller can compare it with what it meant to write.
import { isScalar, parse, visit, type Document } from 'yaml';

/** Printed text and the data parsed back from that exact text. */
export type Printed = { text: string; data: unknown };

/** The two document syntaxes the compiler reads and writes. */
export type DocumentSyntax = 'yaml' | 'json';

// Line folding is off so long text stays on one line, and the library's other defaults already give LF and one final newline.
const YAML_PRINT_OPTIONS = { lineWidth: 0 } as const;

/** Prints a YAML document with fixed options and parses the result again. */
export function printYaml(document: Document): Printed {
  const text = document.toString(YAML_PRINT_OPTIONS);
  return { text, data: parse(text, { maxAliasCount: 100 }) };
}

/** Prints JSON with two spaces, LF and one final newline, and parses the result again. */
export function printJson(data: unknown): Printed {
  const text = JSON.stringify(data, null, 2) + '\n';
  return { text, data: JSON.parse(text) };
}

/** Keeps the digits that carry the value: no sign, no dot, no exponent, no leading or trailing zeros. */
function significantDigits(number: string): string {
  const mantissa = number.split(/[eE]/)[0];
  return mantissa.replace(/^[+-]/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
}

const DECIMAL_NUMBER = /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/** Tells whether a decimal number written in a document would print with different digits once read as a double. */
export function losesDigits(token: string): boolean {
  if (!DECIMAL_NUMBER.test(token)) return false;
  return significantDigits(token) !== significantDigits(String(Number(token)));
}

/** Lists the numbers of a JSON text that a double cannot hold exactly, skipping text inside strings. */
function lossyJsonNumbers(text: string): string[] {
  const found: string[] = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] === '"') {
      index++;
      while (index < text.length && text[index] !== '"') index += text[index] === '\\' ? 2 : 1;
      index++;
      continue;
    }
    const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(index, index + 400));
    if (match) {
      if (losesDigits(match[0])) found.push(match[0]);
      index += match[0].length;
    } else {
      index++;
    }
  }
  return found;
}

/** Lists the numbers of a YAML document as written that a double cannot hold exactly. */
function lossyYamlNumbers(document: Document): string[] {
  const found: string[] = [];
  visit(document, {
    Scalar(_key, node) {
      const written = (node as { source?: string }).source;
      if (isScalar(node) && typeof node.value === 'number' && written && losesDigits(written)) found.push(written);
    },
  });
  return found;
}

/** Lists the numbers of a source that would change when printed: the output must not carry a different number than the source. */
export function lossyNumbers(syntax: DocumentSyntax, source: string, document?: Document): string[] {
  if (syntax === 'json') return lossyJsonNumbers(source);
  return document ? lossyYamlNumbers(document) : [];
}
