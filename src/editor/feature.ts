import { parseDocument, isMap, isScalar, isSeq } from 'yaml';
// Readable names for validation paths: `/ontology/0/relationships/1` becomes
// "ontology → Customer (item 1) → relationships → orders (item 2)".
export function issueFeature(path: string, source?: string) {
  return featureLabeler(source)(path);
}
export function featureLabeler(source?: string) {
  let root: any;
  if (source)
    try {
      const document = parseDocument(source, { uniqueKeys: true });
      if (!document.errors.length) root = document.contents;
    } catch {}
  return (path: string) => {
    if (path === '/' || !path) return 'Document';
    let node: any = root;
    return path
      .replace(/^\//, '')
      .split('/')
      .map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))
      .map(segment => {
        const index = /^\d+$/.test(segment) ? Number(segment) : null;
        const child =
          isSeq(node) && index !== null
            ? node.items[index]
            : isMap(node)
              ? node.get(segment, true)
              : undefined;
        node = child;
        if (index === null) return segment;
        let name: string | undefined;
        if (isMap(child))
          for (const key of ['name', 'id', 'label', 'concept', 'role']) {
            const value = child.get(key, true);
            if (isScalar(value) && typeof value.value === 'string' && value.value.trim()) {
              name = value.value;
              break;
            }
          }
        else if (isScalar(child) && typeof child.value === 'string') name = child.value;
        return name ? `${name} (item ${index + 1})` : `item ${index + 1}`;
      })
      .join(' → ');
  };
}
export function sourceLineRange(source: string, line: number) {
  const lines = source.split('\n'),
    index = Math.max(0, Math.min(lines.length - 1, line - 1));
  const start = lines.slice(0, index).reduce((n, s) => n + s.length + 1, 0);
  return { start, end: start + lines[index].length, line: index + 1 };
}
