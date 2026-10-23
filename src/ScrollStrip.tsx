/** Provides horizontal overflow cues and scrolls selected tabs into view. */
import './ScrollStrip.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

// Room the selected tab keeps from the edges of the strip when it is scrolled into view.
const EDGE_CLEARANCE_PX = 8;
// How much of the visible width one click on a cue moves the strip.
const CUE_SCROLL_SHARE = 0.6;

/** Scroll cues follow the actual overflow; tab selection only scrolls this strip. */
export function ScrollStrip({
  className,
  selection,
  children,
}: {
  className: string;
  selection?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The cues sit beside the strip, not on top of it, so they never cover a half-shown item. Each
  // strip names itself as an anchor and its cues position themselves against that name.
  const anchorName = `--strip-${useId().replace(/\W/g, '')}`;
  const startCue = useRef<HTMLSpanElement>(null);
  const endCue = useRef<HTMLSpanElement>(null);
  const update = () => {
    const strip = ref.current;
    if (!strip || !startCue.current || !endCue.current) return;
    // Both margins are reserved while the strip scrolls at all, so a cue appearing or going away
    // does not move the items.
    strip.classList.toggle('scroll-strip-cued', strip.scrollWidth > strip.clientWidth + 1);
    startCue.current.hidden = strip.scrollLeft <= 1;
    endCue.current.hidden = strip.scrollWidth - strip.clientWidth - strip.scrollLeft <= 1;
  };
  const reveal = () => {
    const strip = ref.current;
    if (!strip) return;
    const selected = selection === undefined ? null : strip.querySelector<HTMLElement>('.selected');
    if (selected && strip.scrollWidth > strip.clientWidth) {
      const outer = strip.getBoundingClientRect();
      const inner = selected.getBoundingClientRect();
      const clearance = EDGE_CLEARANCE_PX;
      if (inner.left < outer.left + clearance) {
        strip.scrollLeft -= outer.left + clearance - inner.left;
      } else if (inner.right > outer.right - clearance) {
        strip.scrollLeft += inner.right - outer.right + clearance;
      }
    }
    update();
  };
  const scrollTowards = (direction: -1 | 1) => () => {
    const strip = ref.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * strip.clientWidth * CUE_SCROLL_SHARE, behavior: 'smooth' });
  };
  // Observers are attached once: size changes and added or removed controls refresh the cues.
  useLayoutEffect(() => {
    const strip = ref.current!;
    const resize = new ResizeObserver(update);
    const mutate = new MutationObserver(update);
    resize.observe(strip);
    mutate.observe(strip, { childList: true, subtree: true, characterData: true });
    strip.addEventListener('scroll', update, { passive: true });
    return () => {
      resize.disconnect();
      mutate.disconnect();
      strip.removeEventListener('scroll', update);
    };
  }, []);
  // A newly selected tab is scrolled into view.
  useLayoutEffect(reveal, [selection]);
  // The cues are for pointer users only: keyboard users reach every control by tabbing, which
  // scrolls the strip by itself.
  const strip = { anchorName } as CSSProperties;
  const cue = { positionAnchor: anchorName } as CSSProperties;
  return (
    <>
      <span
        ref={startCue}
        className="scroll-cue scroll-cue-start"
        style={cue}
        aria-hidden="true"
        title="Show earlier items"
        hidden
        onClick={scrollTowards(-1)}
      >
        <ChevronLeft size={16} />
      </span>
      <div ref={ref} className={className} style={strip}>
        {children}
      </div>
      <span
        ref={endCue}
        className="scroll-cue scroll-cue-end"
        style={cue}
        aria-hidden="true"
        title="Show more items"
        hidden
        onClick={scrollTowards(1)}
      >
        <ChevronRight size={16} />
      </span>
    </>
  );
}
