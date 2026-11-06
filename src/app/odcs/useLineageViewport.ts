/** Keeps the lineage view where the person expects it: first framing, Fit, card anchoring and refits after expansions. */
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { useViewRestore, type Fullscreen } from '../graph/fullscreen';
import type { ExpansionSet } from '../graph/expansion';
import { cardOfNode, type LineageGraph } from './lineage';
import { cardHeight, CARD_W, type LayoutCard } from './lineage-layout';
import type { StageSize } from '../graph/stage-size';

// Column names are 13 px, so this zoom keeps them at 12 px or more on screen.
export const READABLE = 0.93;
export const FIRST_VIEW_MARGIN = 24;
// A large pane keeps the cards at their natural size so the neighbours of the framed cards show
// at its edges.
const FIRST_VIEW_MAX_ZOOM = 1;
// Cards are tall enough that a large expanded group needs to zoom out further than 0.08 to fit.
// The canvas draws only cards on screen, so a higher floor would leave some of them undrawn after Fit.
export const MIN_ZOOM = 0.02;
// Generous guesses of the space the layout leaves between columns and between stacked cards.
export const FIRST_VIEW_COLUMN_GAP = 240;
export const FIRST_VIEW_ROW_GAP = 60;
/** About one second of animation frames; after this a lineage fit stops waiting for card measurements. */
const MAX_FIT_WAIT_FRAMES = 60;
// Space kept between a card that was just resized and the edge of the canvas.
const CARD_EDGE_GAP = 16;
// Where a resized card's top edge goes on screen: the whole card shows when it fits the canvas,
// and a card taller than the canvas keeps its top visible.
function visibleCardTop(top: number, cardPixels: number, canvasPixels: number): number {
  if (!canvasPixels || !cardPixels) return top;
  const lowestTop = canvasPixels - CARD_EDGE_GAP - cardPixels;
  return Math.max(CARD_EDGE_GAP, Math.min(top, lowestTop));
}
type FlowRef = RefObject<ReactFlowInstance<any, any> | null>;
type AnchoredCard = { id: string; layout: string | undefined; screen: { x: number; y: number } };
type LaidOutResult = { key: string; layout: { positions: Record<string, { x: number; y: number }> } };

// Opening or closing a card's columns changes its height, and the new layout can move that card
// far away, so it seemed to vanish. The view follows the card: it stays where it was on screen.
export function useCardAnchor(flow: FlowRef, layoutKey: string | undefined) {
  const anchoredCard = useRef<AnchoredCard | null>(null);
  function keepOnScreen(cardId: string) {
    const reactFlowInstance = flow.current;
    const node = reactFlowInstance?.getNode(cardId);
    if (!reactFlowInstance || !node) return;
    const { x, y, zoom } = reactFlowInstance.getViewport();
    anchoredCard.current = {
      id: cardId,
      layout: layoutKey,
      screen: { x: node.position.x * zoom + x, y: node.position.y * zoom + y },
    };
  }
  return { anchoredCard, keepOnScreen };
}

type ViewportInputs = {
  flow: FlowRef;
  anchoredCard: RefObject<AnchoredCard | null>;
  stage: RefObject<HTMLDivElement | null>;
  layoutCardsRef: RefObject<LayoutCard[]>;
  fullscreen?: Fullscreen;
  result: LaidOutResult | null;
  layoutKey: string;
  nodes: { id: string; position: { x: number; y: number } }[];
  stageSize: StageSize;
  center: string;
  steps: number;
  initialFit: 'readable' | 'all';
  framedCards: Set<string> | null;
  reach: { cards: Set<string> };
  lastSet: ExpansionSet | undefined;
  path: { nodes: Set<string> } | null;
  graph: LineageGraph;
  selected: string;
};

export function useLineageViewport({
  flow,
  anchoredCard,
  stage,
  layoutCardsRef,
  fullscreen,
  result,
  layoutKey,
  nodes,
  stageSize,
  center,
  steps,
  initialFit,
  framedCards,
  reach,
  lastSet,
  path,
  graph,
  selected,
}: ViewportInputs) {
  const viewHeld = useViewRestore(
    fullscreen?.active ?? false,
    () => flow.current?.getViewport(),
    viewport => void flow.current?.setViewport(viewport),
  );
  const fitted = useRef('');
  const firstViewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Keep column names at least 12 px on entry by fitting the nearest readable neighborhood. Fall
  // back to the center alone when needed; explicit Fit may zoom out further.
  const readableFit = useCallback(async (focus: string, group: string[]) => {
    const reactFlowInstance = flow.current;
    if (!reactFlowInstance) return;
    await reactFlowInstance.fitView({ padding: 0.12, maxZoom: 1, duration: 0 });
    if (reactFlowInstance.getZoom() >= READABLE) return;
    const ids = [...new Set([focus, ...group])].filter(id => reactFlowInstance.getNode(id));
    if (ids.length > 1) {
      await reactFlowInstance.fitView({
        nodes: ids.map(id => ({ id })),
        padding: 0.1,
        maxZoom: 1,
        duration: 0,
      });
      if (reactFlowInstance.getZoom() >= READABLE) return;
    }
    const node = reactFlowInstance.getNode(focus);
    const lc = layoutCardsRef.current.find(c => c.id === focus);
    if (node) {
      const width = CARD_W;
      // A card taller than the canvas shows its top (header and first rows), not its middle.
      const height = lc ? cardHeight(lc) : (node.measured?.height ?? 200);
      const visible = (stage.current?.clientHeight ?? 600) / READABLE - 48;
      reactFlowInstance.setCenter(node.position.x + width / 2, node.position.y + Math.min(height, visible) / 2 + (height > visible ? -8 : 0), { zoom: READABLE, duration: 0 });
    }
  }, []);
  const viewKey = [center, steps].join('|');
  // Frames the nearest cards at a readable zoom. When the real layout is wider than the estimate,
  // the farthest framed card is dropped from the frame, never from the canvas, until it fits.
  const firstView = useCallback(async () => {
    if (viewHeld()) return;
    const reactFlowInstance = flow.current;
    if (!reactFlowInstance) return;
    const framed = [...(framedCards ?? reach.cards)].filter(id => reactFlowInstance.getNode(id));
    while (framed.length > 1) {
      await reactFlowInstance.fitView({
        nodes: framed.map(id => ({ id })),
        padding: 0.06,
        maxZoom: FIRST_VIEW_MAX_ZOOM,
        duration: 0,
      });
      if (reactFlowInstance.getZoom() >= READABLE - 0.005) return;
      framed.pop();
    }
    await readableFit(center, []);
  }, [center, reach, framedCards, readableFit, viewHeld]);
  useEffect(() => {
    if (initialFit === 'all') return;
    if (!result || result.key !== layoutKey || !nodes.length) return;
    if (fitted.current === viewKey) return;
    fitted.current = viewKey;
    // A card that opened or closed its columns keeps its place; the view does not start over.
    if (anchoredCard.current) return;
    // Wait until React Flow has measured the pane and the cards with its ResizeObserver.
    firstViewTimer.current = setTimeout(() => requestAnimationFrame(() => void firstView()), 80);
  }, [result, layoutKey, viewKey, nodes.length, initialFit]);
  useEffect(() => {
    if (initialFit !== 'all' || !result || result.key !== layoutKey || !nodes.length || !stageSize.width || !stageSize.height) return;
    if (fitted.current === viewKey || anchoredCard.current || viewHeld()) return;
    let cancelled = false;
    let frame: number;
    let framesWaited = 0;
    const fitOptions = { padding: 0.12, minZoom: MIN_ZOOM, maxZoom: 1, duration: 0 };
    const fitReadyNeighborhood = async () => {
      const instance = flow.current;
      // Offscreen cards have layout dimensions too; wait until React Flow holds this layout,
      // rather than fitting only the cards its first viewport happened to render.
      const ready =
        instance?.viewportInitialized &&
        nodes.every(node => {
          const current = instance.getNode(node.id);
          return (
            current &&
            current.position.x === node.position.x &&
            current.position.y === node.position.y &&
            (current.measured?.width ?? current.initialWidth) &&
            (current.measured?.height ?? current.initialHeight)
          );
        });
      // A card that never reports a size must not keep this loop running; fit what is there instead.
      const gaveUpWaiting = framesWaited >= MAX_FIT_WAIT_FRAMES;
      if ((ready || gaveUpWaiting) && (await instance?.fitView(fitOptions))) {
        if (cancelled) return;
        fitted.current = viewKey;
        // Showing everything only helps while names stay legible; otherwise frame the nearest cards.
        if (instance && instance.getZoom() < READABLE - 0.005) await firstView();
        return;
      }
      framesWaited += 1;
      if (!cancelled) frame = requestAnimationFrame(() => void fitReadyNeighborhood());
    };
    frame = requestAnimationFrame(() => void fitReadyNeighborhood());
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [initialFit, result, layoutKey, viewKey, nodes, stageSize.width, stageSize.height, viewHeld, firstView]);
  useEffect(() => () => clearTimeout(firstViewTimer.current), []);
  // An explicit Fit wins over a first view that is still waiting to run, and shows every card.
  function fitAll() {
    clearTimeout(firstViewTimer.current);
    void flow.current?.fitView({ padding: 0.12, maxZoom: 1, duration: 200 });
  }
  useEffect(() => {
    const anchor = anchoredCard.current;
    // Only the layout made for the new card height moves it; earlier results still hold the old
    // positions.
    if (!anchor || !result || result.key === anchor.layout) return;
    const moved = result.layout.positions[anchor.id];
    if (!moved || !flow.current) return;
    anchoredCard.current = null;
    const zoom = flow.current.getZoom();
    const layoutCard = layoutCardsRef.current.find(candidate => candidate.id === anchor.id);
    const cardPixels = layoutCard ? cardHeight(layoutCard) * zoom : 0;
    const top = visibleCardTop(anchor.screen.y, cardPixels, stage.current?.clientHeight ?? 0);
    void flow.current.setViewport({
      x: anchor.screen.x - moved.x * zoom,
      y: top - moved.y * zoom,
      zoom,
    });
  }, [result]);
  // After an expansion or pierce, bring its cards into a readable view around its origin.
  const focused = useRef('');
  useEffect(() => {
    if (!result || !lastSet || focused.current === lastSet.id) return;
    focused.current = lastSet.id;
    const timer = setTimeout(() => void readableFit(lastSet.from, lastSet.nodes), 120);
    return () => clearTimeout(timer);
  }, [result, lastSet]);
  // The path panel takes room beside the canvas: when a path opens, bring its cards into a
  // readable view (React Flow learns the new width from a ResizeObserver, so this waits for it).
  const panelOpen = !!path;
  useEffect(() => {
    if (!result || !path) return;
    const timer = setTimeout(() => {
      const cards = [...new Set([...path.nodes].map(n => cardOfNode(graph, n)))].filter(c => reach.cards.has(c));
      void readableFit(cardOfNode(graph, selected), cards);
    }, 120);
    return () => clearTimeout(timer);
  }, [panelOpen]);
  return { fitAll };
}
