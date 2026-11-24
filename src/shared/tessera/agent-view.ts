// What an agent may read of a document. Only the agent context and the status flag of an item reach an agent; the marker, notes, the order list,
// owner, steward and classification stay with the people who author the ontology.
import { agentGovernanceFlag, governanceOf } from '../governance/item-governance';
import { additionSites, withoutAdditions, type AdditionSite } from './compile-document';
import { AI_CONTEXT_PROPERTY } from './additions/ai-context';
import { GOVERNANCE_PROPERTY } from './additions/governance';
import { readMarker } from './marker';

/** The keys the agent view uses, which are not Tessera names. The standard ai_context has the same meaning, so agents read one name. */
export const AGENT_CONTEXT_KEY = 'ai_context';
export const AGENT_GOVERNANCE_KEY = 'governance';

function holderOf(root: any, site: AdditionSite): Record<string, unknown> {
  return site.path.slice(0, -1).reduce((node, key) => node[key], root);
}

/** Returns the document without the Tessera marker and additions, except the agent context and a status flag for each item that has governance. An ordinary document is returned as it is. */
export function documentForAgents<Data>(data: Data): Data {
  if (readMarker(data).family === 'standard') return data;
  const sites = additionSites(data);
  const copy = withoutAdditions(data, sites) as any;
  for (const site of sites) {
    if (site.name === AI_CONTEXT_PROPERTY && site.place !== 'root') holderOf(copy, site)[AGENT_CONTEXT_KEY] = structuredClone(site.value);
    if (site.name === GOVERNANCE_PROPERTY && site.place !== 'root') holderOf(copy, site)[AGENT_GOVERNANCE_KEY] = agentGovernanceFlag(governanceOf({ [GOVERNANCE_PROPERTY]: site.value }));
  }
  return copy as Data;
}
