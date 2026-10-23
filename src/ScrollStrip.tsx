/** Provides horizontal overflow cues and scrolls selected tabs into view. */
import { useLayoutEffect, useRef, type ReactNode } from 'react';

// Width of the fade that tells a person more tabs are out of sight.
const FADE_PX = 32;

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
  const update = () => {
    const strip = ref.current;
    if (!strip) return;
    strip.style.setProperty('--fade-start', strip.scrollLeft > 1 ? `${FADE_PX}px` : '0px');
    strip.style.setProperty(
      '--fade-end',
      strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1 ? `${FADE_PX}px` : '0px',
    );
  };
  const reveal = () => {
    const strip = ref.current;
    if (!strip) return;
    const selected = selection === undefined ? null : strip.querySelector<HTMLElement>('.selected');
    if (selected && strip.scrollWidth > strip.clientWidth) {
      const outer = strip.getBoundingClientRect();
      const inner = selected.getBoundingClientRect();
      if (inner.left < outer.left + FADE_PX) strip.scrollLeft -= outer.left + FADE_PX - inner.left;
      else if (inner.right > outer.right - FADE_PX)
        strip.scrollLeft += inner.right - outer.right + FADE_PX;
    }
    update();
  };
  // Observers are attached once: size changes and added or removed controls refresh the fades.
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
  return (
    <div ref={ref} className={className} role={role} aria-label={label}>
      {children}
    </div>
  );
}
