// The one rule for what a brand-supplied CSS value may not contain. It guards brand.css and the
// styles inside a brand SVG, so a value that is refused in one place is refused in the other.

// Escapes can spell any other word, so none are allowed. The functions load a resource, and the
// rest run script or bind behaviour.
const FORBIDDEN_VALUE =
  /\\|url\s*\(|image(-set)?\s*\(|cross-fade\s*\(|src\s*\(|@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding/i;

// A drawing may point at another element of itself, such as a gradient, with url(#id).
const LOCAL_URL = /url\(\s*(['"]?)#[^'")]*\1\s*\)/gi;

/** True when the value holds anything a brand file may not carry. */
export function hasForbiddenValue(value: string, options: { allowLocalUrl?: boolean } = {}) {
  const checked = options.allowLocalUrl ? value.replace(LOCAL_URL, '') : value;
  return FORBIDDEN_VALUE.test(checked);
}
