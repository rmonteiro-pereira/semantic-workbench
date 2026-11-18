/** Keeps the lineage view where the person expects it: first framing, Fit, card anchoring and refits after expansions. */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { getViewportForBounds, type ReactFlowInstance } from '@xyflow/react';
import { useViewRestore, type Fullscreen } from '../graph/fullscreen';
import type { ExpansionSet } from '../graph/expansion';
import { fitsReadableView } from './lineage-view';
import { cardHeight, CARD_W, compactOverviewNamesFit, type LayoutCard } from './lineage-layout';
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
// A card larger than the canvas keeps its leading edge visible for inspection.
function visibleCardOffset(offset: number, cardPixels: number, canvasPixels: number): number {
  if (!canvasPixels || !cardPixels) return offset;
  const lastOffset = canvasPixels - CARD_EDGE_GAP - cardPixels;
  return Math.max(CARD_EDGE_GAP, Math.min(offset, lastOffset));
}
type FlowRef = RefObject<ReactFlowInstance<any, any> | null>;
type AnchoredCard = { id: string; layout: string | undefined; screen: { x: number; y: number } };
type LaidOutResult = { key: string; layout: { positions: Record<string, { x: number; y: number }> } };

// Opening or closing a card's columns changes its height, and the new layout can move that card
// far away, so it seemed to vanish. The view follows the card: it stays where it was on screen.
/** Anchors an opened or closed card to its previous position on screen. */
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
  overview: boolean;
  onOverview: (overview: boolean) => void;
  framedCards: Set<string> | null;
  reach: { cards: Set<string> };
  lastSet: ExpansionSet | undefined;
  path: { nodes: Set<string> } | null;
};

/** Coordinates initial framing and explicit fits with card and pane changes. */
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
  overview,
  onOverview,
  framedCards,
  reach,
  lastSet,
  path,
}: ViewportInputs) {
  const viewHeld = useViewRestore(
    fullscreen?.active ?? false,
    () => flow.current?.getViewport(),
    viewport => void flow.current?.setViewport(viewport),
  );
  const fitted = useRef('');
  const [framedOnly, setFramedOnly] = useState<Set<string> | null>(null);
  const activeLayout = useRef(layoutKey);
  activeLayout.current = layoutKey;
  const firstViewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fitRequested = useRef(false);
  const fitGeneration = useRef(0);
  const [fitRevision, setFitRevision] = useState(0);
  const fitCards = useCallback(
    async (ids?: string[], requireReadableNames = false) => {
      const instance = flow.current;
      if (!instance || activeLayout.current !== layoutKey) return false;
      const cards = nodes
        .filter(node => !ids || ids.includes(node.id))
        .flatMap(node => {
          const layoutCard = layoutCardsRef.current.find(card => card.id === node.id);
          return layoutCard ? [{ ...node.position, width: CARD_W, height: cardHeight(layoutCard), label: layoutCard.label }] : [];
        });
      if (!cards.length || !stageSize.width || !stageSize.height) return false;
      const left = Math.min(...cards.map(card => card.x));
      const top = Math.min(...cards.map(card => card.y));
      const right = Math.max(...cards.map(card => card.x + card.width));
      const bottom = Math.max(...cards.map(card => card.y + card.height));
      const viewport = getViewportForBounds(
        { x: left, y: top, width: right - left, height: bottom - top },
        stage.current?.clientWidth ?? stageSize.width,
        stage.current?.clientHeight ?? stageSize.height,
        MIN_ZOOM,
        FIRST_VIEW_MAX_ZOOM,
        0.06,
      );
      if (requireReadableNames && !compactOverviewNamesFit(cards, viewport.zoom)) return false;
      await instance.setViewport(viewport, { duration: 0 });
      return true;
    },
    [layoutKey, nodes, stageSize],
  );
  const readableFit = useCallback(
    async (focus: string, group: string[]) => {
      const fittedGroup = await fitCards([...new Set([focus, ...group])], overview);
      if (!fittedGroup && group.length) await fitCards([focus], overview);
    },
    [fitCards, overview],
  );
  const viewKey = [center, steps].join('|');
  const firstView = useCallback(async () => {
    const generation = fitGeneration.current;
    if (viewHeld()) return;
    if (fitRequested.current && !overview) {
      onOverview(true);
      return;
    }
    const instance = flow.current;
    if (!instance) return;
    const cards = nodes.flatMap(node => {
      const layoutCard = layoutCardsRef.current.find(card => card.id === node.id);
      return layoutCard ? [{ ...node.position, width: CARD_W, height: cardHeight(layoutCard) }] : [];
    });
    const mayFit = fitRequested.current || overview || fitsReadableView(cards, stageSize, READABLE, FIRST_VIEW_MARGIN);
    const fittedAll = mayFit && (await fitCards(undefined, overview));
    if (generation !== fitGeneration.current || activeLayout.current !== layoutKey) return;
    if (fittedAll) {
      setFramedOnly(null);
    } else if (fitRequested.current) {
      await readableFit(center, []);
    } else if (!overview) {
      onOverview(true);
      return;
    } else {
      const framed = [...(framedCards ?? reach.cards)].filter(id => instance.getNode(id));
      while (framed.length > 1) {
        if (generation !== fitGeneration.current) return;
        const fittedSubset = await fitCards(framed, true);
        if (generation !== fitGeneration.current) return;
        if (fittedSubset) break;
        framed.pop();
      }
      if (framed.length === 1) await readableFit(center, []);
      setFramedOnly(new Set(framed));
    }
    if (generation !== fitGeneration.current || activeLayout.current !== layoutKey) return;
    fitted.current = viewKey;
    fitRequested.current = false;
  }, [overview, onOverview, center, reach, framedCards, readableFit, viewHeld, nodes, stageSize, viewKey, layoutKey, fitCards]);
  useEffect(() => {
    if (!result || result.key !== layoutKey || !nodes.length || !stageSize.width || !stageSize.height) return;
    if ((fitted.current === viewKey && !fitRequested.current) || anchoredCard.current || (viewHeld() && !fitRequested.current)) return;
    let cancelled = false;
    let frame: number;
    let framesWaited = 0;
    const fitWhenMeasured = async () => {
      if (fitted.current === viewKey && !fitRequested.current) return;
      if (viewHeld()) {
        if (!cancelled) frame = requestAnimationFrame(() => void fitWhenMeasured());
        return;
      }
      const instance = flow.current;
      const ready =
        instance?.viewportInitialized &&
        nodes.every(node => {
          const current = instance.getNode(node.id);
          const layoutCard = layoutCardsRef.current.find(card => card.id === node.id);
          return (
            current &&
            layoutCard &&
            current.position.x === node.position.x &&
            current.position.y === node.position.y &&
            Math.abs((current.measured?.height ?? current.initialHeight ?? 0) - cardHeight(layoutCard)) < 1
          );
        });
      if (ready || framesWaited >= MAX_FIT_WAIT_FRAMES) {
        if (!cancelled) await firstView();
        return;
      }
      framesWaited += 1;
      if (!cancelled) frame = requestAnimationFrame(() => void fitWhenMeasured());
    };
    firstViewTimer.current = setTimeout(() => {
      frame = requestAnimationFrame(() => void fitWhenMeasured());
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(firstViewTimer.current);
      cancelAnimationFrame(frame);
    };
  }, [result, layoutKey, viewKey, nodes, stageSize, overview, firstView, viewHeld, fitRevision]);
  useEffect(() => () => clearTimeout(firstViewTimer.current), []);
  // An explicit Fit wins over a pending first view and leaves every card available to pan into view.
  function fitAll() {
    fitGeneration.current += 1;
    setFramedOnly(null);
    anchoredCard.current = null;
    setFitRevision(revision => revision + 1);
    fitRequested.current = true;
    fitted.current = '';
    if (!overview) {
      onOverview(true);
      return;
    }
    if (result?.key === layoutKey && !viewHeld()) void firstView();
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
    const cardWidth = layoutCard ? CARD_W * zoom : 0;
    const cardHeightPixels = layoutCard ? cardHeight(layoutCard) * zoom : 0;
    const left = visibleCardOffset(anchor.screen.x, cardWidth, stage.current?.clientWidth ?? 0);
    const top = visibleCardOffset(anchor.screen.y, cardHeightPixels, stage.current?.clientHeight ?? 0);
    void flow.current.setViewport({
      x: left - moved.x * zoom,
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
  const pendingPanelFit = useRef(false);
  useEffect(() => {
    pendingPanelFit.current = panelOpen;
  }, [panelOpen]);
  useEffect(() => {
    if (!pendingPanelFit.current || !result || !path) return;
    anchoredCard.current = null;
    setFramedOnly(null);
    if (!overview) {
      onOverview(true);
      return;
    }
    if (result.key !== layoutKey) return;
    const timer = setTimeout(async () => {
      pendingPanelFit.current = false;
      const generation = fitGeneration.current;
      if (await fitCards(undefined, true)) return;
      if (generation === fitGeneration.current && activeLayout.current === layoutKey) await readableFit(center, []);
    }, 120);
    return () => clearTimeout(timer);
  }, [panelOpen, overview, result?.key, fitCards, readableFit, center]);
  return { fitAll, framedOnly, releaseFrame: () => setFramedOnly(null) };
}
