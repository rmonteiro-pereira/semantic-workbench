// What an agent may read of a document. Tessera additions are for the people who author the ontology, so they never reach agent context.
import { additionSites, withoutAdditions } from './compile-document';
import { readMarker } from './marker';

/** Returns the document without the Tessera marker and additions. An ordinary document is returned as it is. */
export function documentForAgents<Data>(data: Data): Data {
  if (readMarker(data).family === 'standard') return data;
  return withoutAdditions(data, additionSites(data)) as Data;
}
