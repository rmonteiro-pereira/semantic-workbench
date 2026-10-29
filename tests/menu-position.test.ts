import { describe, expect, test } from 'bun:test';
import { placeFlyout, placeMenu } from '../src/projects/menu-position';

const viewport = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };

test('a menu opens below its button when it fits', () => {
  const anchor = { left: 400, top: 100, right: 430, bottom: 130 };
  const placed = placeMenu(anchor, menu, viewport, { side: 'below', align: 'start' });
  expect(placed).toEqual({ top: 136, left: 400, maxHeight: 300, side: 'below' });
});

test('a menu flips up when there is no room below and more above', () => {
  const anchor = { left: 400, top: 600, right: 430, bottom: 630 };
  const placed = placeMenu(anchor, menu, viewport, { side: 'below', align: 'start' });
  expect(placed.side).toBe('above');
  expect(placed.top).toBe(600 - 6 - 300);
});

test('a menu that fits on neither side shrinks to the larger room and scrolls', () => {
  const anchor = { left: 400, top: 380, right: 430, bottom: 410 };
  const tall = { width: 200, height: 900 };
  const placed = placeMenu(anchor, tall, viewport, { side: 'below', align: 'start' });
  expect(placed.maxHeight).toBeLessThan(900);
  expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(viewport.height - 12);
});

test('a menu stays inside the window sideways', () => {
  const nearRight = { left: 960, top: 100, right: 990, bottom: 130 };
  const placed = placeMenu(nearRight, menu, viewport, { side: 'below', align: 'start' });
  expect(placed.left + menu.width).toBeLessThanOrEqual(viewport.width - 12);
  const nearLeft = { left: 2, top: 100, right: 30, bottom: 130 };
  const aligned = placeMenu(nearLeft, menu, viewport, { side: 'below', align: 'end' });
  expect(aligned.left).toBe(12);
});

test('the preferred upward side is kept when the menu fits there', () => {
  const anchor = { left: 100, top: 600, right: 400, bottom: 640 };
  const placed = placeMenu(anchor, menu, viewport, { side: 'above', align: 'start' });
  expect(placed.side).toBe('above');
});

describe('a flyout beside the sidebar', () => {
  const button = { left: 8, top: 640, right: 240, bottom: 676 };
  const sidebarRight = 248;

  test('sits right of the sidebar with its bottom on the button bottom', () => {
    const placed = placeFlyout(button, sidebarRight, menu, viewport);
    expect(placed).toEqual({ top: 676 - 300, left: 254, maxHeight: 300, side: 'above' });
  });

  test('is capped to the window and scrolls when taller than the room above', () => {
    const tall = { width: 200, height: 900 };
    const placed = placeFlyout(button, sidebarRight, tall, viewport);
    expect(placed?.top).toBe(12);
    expect(placed?.maxHeight).toBe(676 - 12);
  });

  test('gives way on a phone and when the menu does not fit on the right', () => {
    expect(placeFlyout(button, sidebarRight, menu, { width: 650, height: 800 })).toBeUndefined();
    expect(placeFlyout(button, 900, menu, viewport)).toBeUndefined();
  });
});
