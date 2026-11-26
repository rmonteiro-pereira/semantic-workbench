// Runs inside the page: lists clipped text, ellipses and the state indicators of one cropped region.
// It must stay self-contained, because Playwright serialises it into the browser.

export interface RegionMeasurements {
  clipped: string[];
  ellipsis: string[];
  indicators: { text: string | undefined; label: string | null; pressed: string | null; class: string; border: string; width: number }[];
}

export function measureRegion(root: Element): RegionMeasurements {
  const indicatorSelector = '.traffic-ring, .traffic-bar, .item-change-mark, .compile-state-title, [role=alert], [role=status], [aria-pressed]';

  function isMeasurable(element: Element) {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!bounds.width || !bounds.height) return false;
    if (style.visibility === 'hidden') return false;
    // Visually hidden text for screen readers is clipped on purpose.
    if (style.clipPath === 'inset(50%)') return false;
    const insideClosedDetails = element.closest('details:not([open])') !== null && element.tagName !== 'SUMMARY';
    return !insideClosedDetails;
  }

  function ownText(element: Element) {
    return [...element.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join('')
      .trim();
  }

  function describeIndicator(element: Element) {
    const style = getComputedStyle(element);
    return {
      text: element.textContent?.trim().slice(0, 200),
      label: element.getAttribute('aria-label'),
      pressed: element.getAttribute('aria-pressed'),
      class: String(element.className),
      border: style.borderTopWidth,
      width: element.getBoundingClientRect().width,
    };
  }

  const clipped: string[] = [];
  const ellipsis: string[] = [];
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (!isMeasurable(element)) continue;
    const text = ownText(element);
    if (!text) continue;
    const label = `${element.tagName.toLowerCase()}.${String(element.className)} ${text.slice(0, 100)}`;
    const overflowsWidth = element.scrollWidth > element.clientWidth;
    const overflowsHeight = element.scrollHeight > element.clientHeight;
    if (overflowsWidth || overflowsHeight) {
      clipped.push(`${label}: scroll ${element.scrollWidth}×${element.scrollHeight}, client ${element.clientWidth}×${element.clientHeight}`);
    }
    const writesDots = text.includes('…') || text.includes('...');
    const cssEllipsis = getComputedStyle(element).textOverflow === 'ellipsis' && overflowsWidth;
    if (writesDots || cssEllipsis) ellipsis.push(label);
  }
  const indicators = [...root.querySelectorAll(indicatorSelector)].filter(element => element.getBoundingClientRect().width > 0).map(describeIndicator);
  return { clipped, ellipsis, indicators };
}
