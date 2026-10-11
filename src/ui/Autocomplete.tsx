import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { applySuggestion, completionContext, shouldAutoOpen, suggest, type CompletionContext, type QueryMode, type Suggestion } from '../query/complete';
import type { FieldPath } from '../worker/fields';
import { listKeyAction } from './autocompleteKeys';

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
  const composing = useRef(false);
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
    const { key, code, keyCode, shiftKey, ctrlKey, metaKey, altKey } = e;
    const action = listKeyAction({ key, code, keyCode, shiftKey, ctrlKey, metaKey, altKey, isComposing: e.nativeEvent.isComposing }, list !== null);
    if (action) e.preventDefault();
    switch (action) {
      case 'open':
        update(value, caretOf(e.currentTarget), true);
        return;
      case 'next':
      case 'prev': {
        const n = list!.items.length;
        setActive((a) => (a + (action === 'next' ? 1 : n - 1)) % n);
        return;
      }
      case 'accept':
        accept(list!.items[active]);
        return;
      case 'close':
        e.stopPropagation();
        setList(null);
        return;
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
          // While an IME composes, the text is provisional: wait for compositionend.
          if (!composing.current) update(e.target.value, caretOf(e.target), false);
        }}
        onCompositionStart={() => {
          composing.current = true;
          setList(null);
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          update(e.currentTarget.value, caretOf(e.currentTarget), false);
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
      {/* Keep focus in the input when pressing an option or the list's scrollbar. */}
      <div className="ac__pop" hidden={!open} onMouseDown={(e) => e.preventDefault()}>
        <ul id={listId} role="listbox" className="ac__list" dir="ltr">
          {list?.items.map((s, n) => (
            <li
              key={`${s.kind}:${s.label}`}
              id={optionId(n)}
              role="option"
              aria-selected={n === active}
              className={`ac__item${n === active ? ' ac__item--active' : ''}`}
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
