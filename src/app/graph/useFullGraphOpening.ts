/** Chooses the initial graph representation from its completed, rendered layout. */
import { useRef, useState, type RefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { modelOverview } from './overview';
import { fitFullGraph, fitGraphArea } from './full-graph-viewport';
import { NAME_MIN_PX, LARGEST_ENTITY_NAME_PX, startsCollapsed, textSizesAt } from './overview-capacity';

type Overview = ReturnType<typeof modelOverview>;
type Inputs = {
  overview: Overview;
  algorithm: 'network' | 'layered';
  collapseChoice: Set<string> | null;
  flow: RefObject<ReactFlowInstance<any, any> | null>;
  container: RefObject<HTMLDivElement | null>;
  reservedWidth: number;
  onFitZoom: (zoom: number) => void;
  onArea: (id: string) => void;
};
type Decision = { overview: Overview; algorithm: string; collapsed: boolean; minimumName: number; elapsed: number };

/** Measures visible glyph size as well as the name box, so wrapped lines cannot hide tiny text. */
export function renderedNameMinimum(canvas: Element, zoom: number): number {
  const names = [...canvas.querySelectorAll<HTMLElement>('.full-entity:not(.collapsed) strong')];
  return Math.min(...names.map(name => Math.min(name.getBoundingClientRect().height, Number.parseFloat(getComputedStyle(name).fontSize) * zoom)));
}

/** Waits for React Flow's fitted nodes and their text styles to reach the browser. */
export function afterGraphPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** Decides representation only after fitted text has painted at the completed layout's scale. */
export async function measureGraphOpening(entityCount: number, measure: () => number | Promise<number>, afterPaint = afterGraphPaint, fitNameLimit = Number.POSITIVE_INFINITY) {
  await afterPaint();
  const minimumName = Math.min(await measure(), fitNameLimit);
  return { minimumName, collapsed: startsCollapsed(entityCount, minimumName) };
}

/** Keeps an automatic opening decision separate from the person's explicit area choices. */
export function useFullGraphOpening({ overview, algorithm, collapseChoice, flow, container, reservedWidth, onFitZoom, onArea }: Inputs) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const current = useRef({ overview, algorithm, collapseChoice });
  current.current = { overview, algorithm, collapseChoice };
  const matches = decision?.overview === overview && decision.algorithm === algorithm;
  const safetyCollapse = startsCollapsed(overview.entities.length);
  const automaticCollapse = safetyCollapse || (algorithm === 'network' && matches && decision.collapsed);
  const checking = collapseChoice === null && !safetyCollapse && !matches;

  const openLayout = async () => {
    const canvas = container.current?.querySelector('.react-flow');
    const instance = flow.current;
    if (!canvas || !instance) return;
    const started = performance.now();
    const cards = instance.getNodes().filter(node => node.type === 'entity');
    const counted = cards.length > 0 && cards.every(node => node.data.collapsedArea);
    const nameCap = Math.min(LARGEST_ENTITY_NAME_PX, ...cards.map(node => Number.parseFloat(String(node.data.nameCap ?? 16))));
    // A tiny margin keeps subpixel rounding from dropping a counted name below the boundary.
    const minimumZoom = counted ? NAME_MIN_PX / nameCap + 0.001 : 0.001;
    const zoom = fitFullGraph(instance, canvas, 0, reservedWidth, minimumZoom);
    if (zoom === undefined) return;
    onFitZoom(zoom);
    if (algorithm === 'layered') {
      const area = overview.groups[0]?.id;
      if (area) {
        fitGraphArea(instance, canvas, area, reservedWidth);
        onArea(area);
      }
    }
    // The fit also includes names outside the mounted viewport, so rendered nodes alone can overstate legibility.
    const fitNameLimit = algorithm === 'network' ? Math.min(nameCap, textSizesAt(zoom, algorithm, counted).entityName) * zoom : undefined;
    const measure = () => renderedNameMinimum(canvas, algorithm === 'network' ? zoom : instance.getViewport().zoom);
    const measured = await measureGraphOpening(overview.entities.length, measure, afterGraphPaint, fitNameLimit);
    if (current.current.overview !== overview || current.current.algorithm !== algorithm || current.current.collapseChoice !== collapseChoice) return;
    if (matches || collapseChoice !== null || safetyCollapse) return;
    const { minimumName } = measured;
    const collapsed = algorithm === 'network' && measured.collapsed;
    setDecision({ overview, algorithm, collapsed, minimumName, elapsed: performance.now() - started });
  };

  return { automaticCollapse, checking, openLayout, minimumName: matches ? decision.minimumName : undefined, decisionMs: matches ? decision.elapsed : undefined };
}
