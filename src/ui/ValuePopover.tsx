import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { JsonNode } from './JsonTree';

const DELAY = 150;
const GAP = 4;
const MARGIN = 8;

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Places a popover of the given size next to an anchor, inside the viewport.
 * Returns the block offset from the viewport top and the inline offset from the viewport's
 * inline-start edge (the right edge in RTL), so it can be applied with logical inset properties.
 */
export function placePopover(anchor: Rect, size: { width: number; height: number }, viewport: { width: number; height: number }, rtl: boolean) {
  const fitsBelow = anchor.bottom + GAP + size.height <= viewport.height - MARGIN;
  const fitsAbove = anchor.top - GAP - size.height >= MARGIN;
  const top = fitsBelow || !fitsAbove ? anchor.bottom + GAP : anchor.top - GAP - size.height;
  const start = rtl ? viewport.width - anchor.right : anchor.left;
  const clamp = (v: number, max: number) => Math.max(MARGIN, Math.min(v, max - MARGIN));
  return { top: clamp(top, viewport.height - size.height), start: clamp(start, viewport.width - size.width) };
}

interface PopoverProps {
  anchor: HTMLElement;
  value: unknown;
  id: string;
  onEnter(): void;
  onLeave(): void;
  onDismiss(): void;
}

/** A floating JSON tree of one value, shown next to its table cell. */
export function ValuePopover({ anchor, value, id, onEnter, onLeave, onDismiss }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; start: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    setPos(placePopover(anchor.getBoundingClientRect(), { width, height }, viewport, getComputedStyle(el).direction === 'rtl'));
  }, [anchor]);

  // A fixed popover would drift away from its cell when the table or page scrolls.
  useEffect(() => {
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) onDismiss();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [onDismiss]);

  return createPortal(
    // The outer box inherits the page direction, so inset-inline-start follows the UI language; the JSON itself is LTR.
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="vpop"
      style={pos ? { insetBlockStart: pos.top, insetInlineStart: pos.start } : { insetBlockStart: 0, insetInlineStart: 0, visibility: 'hidden' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="vpop__body" dir="ltr">
        <JsonNode value={value} depth={0} />
      </div>
    </div>,
    document.body,
  );
}

/** A table cell holding an array or object: hover or focus shows its value as a JSON tree. */
export function PopoverCell({ value, children }: { value: unknown; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const cell = useRef<HTMLTableCellElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  const later = (next: boolean) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), DELAY);
  };
  const keep = () => clearTimeout(timer.current);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <td
      ref={cell}
      tabIndex={0}
      className="cell--branch"
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => later(true)}
      onMouseLeave={() => later(false)}
      onFocus={() => later(true)}
      onBlur={() => later(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          dismiss();
        }
      }}
    >
      {children}
      {open && cell.current && <ValuePopover anchor={cell.current} value={value} id={id} onEnter={keep} onLeave={() => later(false)} onDismiss={dismiss} />}
    </td>
  );
}
