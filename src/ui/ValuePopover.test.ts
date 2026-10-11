import { describe, expect, it } from 'vitest';
import { placePopover } from './ValuePopover';

const viewport = { width: 1000, height: 800 };
const size = { width: 300, height: 200 };
const cell = (left: number, top: number) => ({ left, right: left + 100, top, bottom: top + 30 });

describe('placePopover', () => {
  it('opens below the cell, aligned with its inline-start edge', () => {
    expect(placePopover(cell(100, 100), size, viewport, false)).toEqual({ top: 134, start: 100 });
  });

  it('measures the inline offset from the right edge in RTL', () => {
    expect(placePopover(cell(600, 100), size, viewport, true)).toEqual({ top: 134, start: 300 });
  });

  it('flips above when there is no room below', () => {
    expect(placePopover(cell(100, 700), size, viewport, false)).toEqual({ top: 496, start: 100 });
  });

  it('stays inside the viewport near the inline-end edge', () => {
    expect(placePopover(cell(900, 100), size, viewport, false).start).toBe(692);
    expect(placePopover(cell(0, 100), size, viewport, true).start).toBe(692);
  });

  it('clamps to the top when it fits neither below nor above', () => {
    expect(placePopover(cell(100, 100), { width: 300, height: 790 }, viewport, false).top).toBe(8);
  });
});
