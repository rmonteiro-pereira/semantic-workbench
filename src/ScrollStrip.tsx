import {useLayoutEffect, useRef, type ReactNode} from 'react';

/** Scroll cues follow the actual overflow; tab selection only scrolls this strip. */
export function ScrollStrip({className, selection, children}: {className: string; selection?: string; children: ReactNode}) {
 const ref = useRef<HTMLDivElement>(null);
 const update = () => {
  const strip = ref.current; if (!strip) return;
  strip.style.setProperty('--fade-start', strip.scrollLeft > 1 ? '18px' : '0px');
  strip.style.setProperty('--fade-end', strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1 ? '18px' : '0px');
 };
 const reveal = () => {
  const strip = ref.current; if (!strip) return;
  const selected = selection === undefined ? null : strip.querySelector<HTMLElement>('.selected');
  if (selected && strip.scrollWidth > strip.clientWidth) {
   const outer = strip.getBoundingClientRect(), inner = selected.getBoundingClientRect();
   if (inner.left < outer.left + 18) strip.scrollLeft -= outer.left + 18 - inner.left;
   else if (inner.right > outer.right - 18) strip.scrollLeft += inner.right - outer.right + 18;
  }
  update();
 };
 // Observers are attached once: size changes and added or removed controls refresh the fades.
 useLayoutEffect(() => {
  const strip = ref.current!;
  const resize = new ResizeObserver(update), mutate = new MutationObserver(update);
  resize.observe(strip); mutate.observe(strip, {childList: true, subtree: true, characterData: true});
  strip.addEventListener('scroll', update, {passive: true});
  return () => { resize.disconnect(); mutate.disconnect(); strip.removeEventListener('scroll', update); };
 }, []);
 // A newly selected tab is scrolled into view.
 useLayoutEffect(reveal, [selection]);
 return <div ref={ref} className={className}>{children}</div>;
}
