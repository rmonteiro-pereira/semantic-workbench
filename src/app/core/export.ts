/** Downloads the original document text without reserializing it. */
/** Downloads the supplied source text without reserializing it. */
export function exportDocument(source: string, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  let type: string;
  if (ext === 'json') {
    type = 'application/json';
  } else if (ext === 'ttl' || ext === 'shacl') {
    type = 'text/turtle';
  } else if (ext === 'nt') {
    type = 'application/n-triples';
  } else if (ext === 'rdf' || ext === 'owl' || ext === 'xml') {
    if (source.trimStart().startsWith('<')) {
      type = 'application/rdf+xml';
    } else {
      type = 'text/turtle';
    }
  } else {
    type = 'application/yaml';
  }
  return { filename, blob: new Blob([source], { type: type + ';charset=utf-8' }) };
}
