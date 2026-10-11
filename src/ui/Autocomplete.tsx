import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { applySuggestion, completionContext, shouldAutoOpen, suggest, type CompletionContext, type QueryMode, type Suggestion } from '../query/complete';
import type { FieldPath } from '../worker/fields';

const MAX_ITEMS = 100;

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'role'> {
  value: string;
  onValueChange(value: string): void;
  mode: QueryMode;
  paths: FieldPath[];
}

interface List {
  ctx: CompletionContext;
  items: Suggestion[];
}

/** A query input with a field/operator/helper suggestion list (ARIA combobox pattern). */
export function AutocompleteInput({ value, onValueChange, mode, paths, onKeyDown, onBlur, ...rest }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [list, setList] = useState<List | null>(null);
  const [active, setActive] = useState(0);
  const pendingCaret = useRef<number | null>(null);
  const optionId = (n: number) => `${listId}-${n}`;

  // Restore the caret after inserting a suggestion into the controlled input.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !input.current) return;
    pendingCaret.current = null;
    input.current.setSelectionRange(caret, caret);
  });

  useEffect(() => {
    if (list) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [list, active, listId]);

  const update = (text: string, caret: number, force: boolean) => {
    const ctx = completionContext(text, caret);
    const items = suggest(ctx, mode, paths).slice(0, MAX_ITEMS);
    setActive(0);
    setList(items.length && (force || shouldAutoOpen(text, ctx)) ? { ctx, items } : null);
  };
  const caretOf = (el: HTMLInputElement) => el.selectionStart ?? el.value.length;

  const accept = (s: Suggestion) => {
    if (!list) return;
    const r = applySuggestion(value, list.ctx, s);
    pendingCaret.current = r.caret;
    setList(null);
    onValueChange(r.text);
  };

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && (e.key === ' ' || e.code === 'Space')) {
      e.preventDefault();
      update(value, caretOf(e.currentTarget), true);
      return;
    }
    if (list) {
      const n = list.items.length;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActive((a) => (a + 1) % n);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setActive((a) => (a - 1 + n) % n);
          return;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          accept(list.items[active]);
          return;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          setList(null);
          return;
      }
    }
    onKeyDown?.(e);
  };

  const open = list !== null;
  return (
    <div className="ac">
      <input
        {...rest}
        ref={input}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          update(e.target.value, caretOf(e.target), false);
        }}
        onKeyDown={keyDown}
        onKeyUp={(e) => {
          if (open && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) update(value, caretOf(e.currentTarget), true);
        }}
        onClick={(e) => open && update(value, caretOf(e.currentTarget), true)}
        onBlur={(e) => {
          setList(null);
          onBlur?.(e);
        }}
      />
      {/* The box follows the page direction (logical inset); its suggestions are code, so always LTR. */}
      <div className="ac__pop" hidden={!open}>
        <ul id={listId} role="listbox" className="ac__list" dir="ltr">
          {list?.items.map((s, n) => (
            <li
              key={`${s.kind}:${s.label}`}
              id={optionId(n)}
              role="option"
              aria-selected={n === active}
              className={`ac__item${n === active ? ' ac__item--active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => n !== active && setActive(n)}
              onClick={() => accept(s)}
            >
              <span className="ac__label">{s.label}</span>
              <span className="ac__detail">{s.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
