// The fixed words the agent panel shows before a session starts. The server and the browser read the same text.

/** What a person must know before connecting an agent: the product calls no model, and the agent may forward what it receives. The product name comes from the brand. */
export function connectionStatement(productName: string): string {
  return `${productName} does not call a language model. When you connect an external agent, that agent can receive definitions you authorize and may send them to its model provider; its configuration and policies govern that onward use.`;
}

/** What the connection allows, in plain words. */
export const SCOPE_LINES = ['Read files you may read', 'Change files you may edit'] as const;

/** What the connection does not offer. */
export const NOT_OFFERED_NOTE = 'Committing, pushing and publishing are not offered here. An agent that needs them needs a separate connection of its own.';
