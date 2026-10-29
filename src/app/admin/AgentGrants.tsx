import { ListInput } from './ListInput';
import { useState } from 'react';
import { ReviewChange } from './ReviewChange';
import { commaList } from './change-review';
import type { AgentsConfig } from './types';

/** Edits agent client scopes and reviews their effects before activation. */
export function AgentGrants({
  initial,
  version,
  onSaved,
}: {
  initial: AgentsConfig;
  version: string;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState(initial);
  function update(index: number, field: string, text: string) {
    const value = field === 'projects' || field === 'domains' ? commaList(text) : text;
    setConfig({
      ...config,
      clients: config.clients.map((client, position) =>
        position === index ? { ...client, [field]: value } : client,
      ),
    });
  }
  function addClient() {
    setConfig({
      ...config,
      clients: [...config.clients, { clientId: '', name: '', projects: [], domains: [] }],
    });
  }
  function removeClient(index: number) {
    setConfig({ ...config, clients: config.clients.filter((_, position) => position !== index) });
  }
  return (
    <section>
      <h3>Agent client grants</h3>
      {config.clients.map((client, index) => (
        <fieldset key={index}>
          <legend>{client.name || 'New client'}</legend>
          {(['clientId', 'name', 'projects', 'domains'] as const).map(field => (
            <label key={field}>
              {field}
              {field === 'projects' || field === 'domains' ? (
                <ListInput
                  value={client[field]}
                  onChange={value => update(index, field, value.join(', '))}
                />
              ) : (
                <input
                  value={client[field]}
                  onChange={event => update(index, field, event.target.value)}
                />
              )}
            </label>
          ))}
          <button onClick={() => removeClient(index)}>Remove client</button>
        </fieldset>
      ))}
      <button onClick={addClient}>Add client</button>
      <p>Preview client access before saving these grants.</p>
      <ReviewChange
        area="agents"
        proposal={config}
        baseVersion={version}
        onSaved={onSaved}
        description="Save agent grants"
      />
    </section>
  );
}
