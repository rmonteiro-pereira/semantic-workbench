/** Presentation and event handling for workspace toolbar. */
import { Box, FileCheck2, FileCode, Focus, Gauge, Layers, Network, Search } from 'lucide-react';
import React from 'react';
import type { KpiSummary } from '../../server/agent/explain';
import type { Relationship } from '../../shared/core/model';
import { ScrollStrip } from '../components/ScrollStrip';

type Props = {
  tab: string;
  isContract: boolean;
  lineageShown: boolean;
  setTab: (next: string) => void;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  showNeighborhood: (id?: string) => void;
  neighborhoodFocus: string;
  selected: string;
  relationship: Relationship | undefined;
  compact: boolean;
  closeWorkspace: () => void;
  kpis: KpiSummary[];
  search: string;
};
/** Renders workspace toolbar. */
export const WorkspaceToolbar = React.memo(function WorkspaceToolbar({
  tab,
  isContract,
  lineageShown,
  setTab,
  setSearch,
  showNeighborhood,
  neighborhoodFocus,
  selected,
  relationship,
  compact,
  closeWorkspace,
  kpis,
  search,
}: Props) {
  function handleButtonClick() {
    setTab('fullgraph');
    setSearch('');
  }

  function handleButtonClick2() {
    return showNeighborhood(neighborhoodFocus || selected || relationship?.source || '');
  }

  function handleButtonClick3() {
    setTab('source');
    if (compact) closeWorkspace();
  }

  return (
    <>
      <div className="toolbar">
        <ScrollStrip className="tabs" selection={tab}>
          {isContract && (
            <button className={tab === 'contract' ? 'selected' : ''} aria-current={tab === 'contract' ? 'page' : undefined} onClick={() => setTab('contract')}>
              <FileCheck2 size={16} /> Contract
            </button>
          )}
          <button
            className={tab === 'overview' ? 'selected' : ''}
            aria-current={tab === 'overview' ? 'page' : undefined}
            onClick={() => {
              setTab('overview');
              setSearch('');
            }}
          >
            <Layers size={16} /> Overview
          </button>
          <button className={tab === 'fullgraph' ? 'selected' : ''} aria-current={tab === 'fullgraph' ? 'page' : undefined} onClick={handleButtonClick}>
            <Network size={16} /> Graph
          </button>
          <button className={tab === 'neighborhood' ? 'selected' : ''} aria-current={tab === 'neighborhood' ? 'page' : undefined} onClick={handleButtonClick2}>
            <Focus size={16} /> Neighborhood
          </button>
          <button className={tab === 'catalog' ? 'selected' : ''} aria-current={tab === 'catalog' ? 'page' : undefined} onClick={() => setTab('catalog')}>
            <Box size={16} /> Catalog
          </button>
          <button className={tab === 'source' ? 'selected' : ''} aria-current={tab === 'source' ? 'page' : undefined} onClick={handleButtonClick3}>
            <FileCode size={16} /> Source
          </button>
          <button className={tab === 'mappings' ? 'selected' : ''} aria-current={tab === 'mappings' ? 'page' : undefined} onClick={() => setTab('mappings')}>
            <Layers size={16} /> Mappings
          </button>
          <button className={tab === 'metrics' ? 'selected' : ''} aria-current={tab === 'metrics' ? 'page' : undefined} onClick={() => setTab('metrics')}>
            <Gauge size={16} /> Metrics
            {kpis.length > 0 && <span className="tab-count">{kpis.length}</span>}
          </button>
        </ScrollStrip>
        {/* The lineage canvas has its own Find assets. */}
        {!lineageShown && (
          <label className="search">
            <Search size={16} />
            <input placeholder="Find an entity…" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
        )}
      </div>
    </>
  );
});
