/** Provides horizontal overflow cues and scrolls selected tabs into view. */
import './ScrollStrip.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

// Room the selected tab keeps from the edges of the strip when it is scrolled into view.
const EDGE_CLEARANCE_PX = 8;
// How much of the visible width one click on a cue moves the strip.
const CUE_SCROLL_SHARE = 0.6;

// Native focus may leave a control partly visible; reserve the same clearance as selection.
function revealControl(strip: HTMLElement, control: HTMLElement) {
  const outer = strip.getBoundingClientRect();
  const inner = control.getBoundingClientRect();
  if (inner.left < outer.left + EDGE_CLEARANCE_PX) {
    strip.scrollLeft -= outer.left + EDGE_CLEARANCE_PX - inner.left;
  } else if (inner.right > outer.right - EDGE_CLEARANCE_PX) {
    strip.scrollLeft += inner.right - outer.right + EDGE_CLEARANCE_PX;
  }
}

/** Scroll cues follow the actual overflow; tab selection only scrolls this strip. */
export function ScrollStrip({
  className,
  selection,
  role,
  label,
  children,
}: {
  className: string;
  selection?: string;
  /** The ARIA role of the strip, for a strip that is a tab list. */
  role?: string;
  /** The accessible name of the strip, for a strip with a role. */
  label?: string;
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
    if (!strip.matches('.tabs, .odcs-tabs')) return;
    const frame = strip.getBoundingClientRect();
    for (const tab of strip.querySelectorAll<HTMLElement>(':scope > button')) {
      const bounds = tab.getBoundingClientRect();
      const clipped = bounds.left < frame.left - 1 || bounds.right > frame.right + 1;
      tab.dataset.scrollClipped = String(clipped);
    }
  };
  const reveal = () => {
    const strip = ref.current;
    if (!strip) return;
    update();
    const selected = selection === undefined ? null : strip.querySelector<HTMLElement>('.selected');
    if (selected && strip.scrollWidth > strip.clientWidth) {
      revealControl(strip, selected);
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
    const resize = new ResizeObserver(reveal);
    const mutate = new MutationObserver(reveal);
    resize.observe(strip);
    mutate.observe(strip, { childList: true, subtree: true, characterData: true });
    function revealFocused(event: FocusEvent) {
      if (!(event.target instanceof HTMLElement)) return;
      const control = event.target.closest('button');
      if (!control || control.parentElement !== strip) return;
      requestAnimationFrame(() => {
        revealControl(strip, control);
        update();
      });
    }
    strip.addEventListener('focusin', revealFocused);
    strip.addEventListener('scroll', update, { passive: true });
    return () => {
      resize.disconnect();
      mutate.disconnect();
      strip.removeEventListener('focusin', revealFocused);
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
      <div ref={ref} className={className} style={strip} role={role} aria-label={label}>
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
