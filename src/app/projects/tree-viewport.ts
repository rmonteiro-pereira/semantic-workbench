/** Chooses the last complete row boundary inside the available tree height. */
export function completeRowsHeight(available: number, rowBottoms: number[]): number {
  const boundaries = rowBottoms.filter(bottom => bottom > 0 && bottom <= available);
  return boundaries.length ? Math.max(...boundaries) : available;
}

/** Fits the scrolling tree to whole rows while its frame keeps the available sidebar space. */
export function observeTreeViewport(tree: HTMLElement): () => void {
  const scroller = tree.closest<HTMLElement>('.documents');
  const frame = scroller?.parentElement;
  if (!scroller || !frame?.matches('.documents-frame')) return () => {};
  let pendingFrame = 0;

  function fit() {
    pendingFrame = 0;
    const top = scroller!.getBoundingClientRect().top;
    const rows = tree.querySelectorAll<HTMLElement>(
      '.project > .tree-row, .repository > .tree-row, .project-file, .hidden-files',
    );
    const bottomBorder = scroller!.offsetHeight - scroller!.clientHeight - scroller!.clientTop;
    const available = frame!.clientHeight - bottomBorder;
    if (available <= 0) return;
    const rowBottoms = [...rows].map(row => row.getBoundingClientRect().bottom - top);
    const height = Math.floor(completeRowsHeight(available, rowBottoms) + bottomBorder);
    const value = `${height}px`;
    if (scroller!.style.height === value) return;
    const atEnd = scroller!.scrollHeight - scroller!.clientHeight - scroller!.scrollTop <= 1;
    scroller!.style.height = value;
    if (atEnd) scroller!.scrollTop = scroller!.scrollHeight;
  }

  function scheduleFit() {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(fit);
  }

  const observer = new ResizeObserver(scheduleFit);
  observer.observe(frame);
  observer.observe(tree);
  scroller.addEventListener('scroll', scheduleFit, { passive: true });
  fit();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(pendingFrame);
    scroller.removeEventListener('scroll', scheduleFit);
    scroller.style.height = '';
  };
}
