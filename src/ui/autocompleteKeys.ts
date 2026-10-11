/** The parts of a keydown event the autocomplete list reacts to. */
export interface KeyInfo {
  key: string;
  code: string;
  keyCode: number;
  isComposing: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export type ListKeyAction = 'open' | 'next' | 'prev' | 'accept' | 'close';

/**
 * What a keydown does to the suggestion list, or null to leave it to the input/form.
 * Keys during IME composition (keyCode 229 covers browsers that fire keydown before
 * compositionstart) always belong to the IME.
 */
export function listKeyAction(e: KeyInfo, open: boolean): ListKeyAction | null {
  if (e.isComposing || e.keyCode === 229) return null;
  if (e.ctrlKey && (e.key === ' ' || e.code === 'Space')) return 'open';
  if (!open) return null;
  const plain = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
  switch (e.key) {
    case 'ArrowDown':
      return 'next';
    case 'ArrowUp':
      return 'prev';
    case 'Enter':
    case 'Tab':
      return plain ? 'accept' : null;
    case 'Escape':
      return 'close';
  }
  return null;
}
