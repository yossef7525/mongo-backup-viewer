import { describe, expect, it } from 'vitest';
import { listKeyAction, type KeyInfo } from './autocompleteKeys';

const k = (key: string, over: Partial<KeyInfo> = {}): KeyInfo => ({ key, code: '', keyCode: 0, isComposing: false, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...over });

describe('listKeyAction', () => {
  it('maps navigation keys while the list is open', () => {
    expect(listKeyAction(k('ArrowDown'), true)).toBe('next');
    expect(listKeyAction(k('ArrowUp'), true)).toBe('prev');
    expect(listKeyAction(k('Enter'), true)).toBe('accept');
    expect(listKeyAction(k('Tab'), true)).toBe('accept');
    expect(listKeyAction(k('Escape'), true)).toBe('close');
    expect(listKeyAction(k('a'), true)).toBeNull();
  });

  it('leaves keys alone while the list is closed, except Ctrl+Space', () => {
    expect(listKeyAction(k('Enter'), false)).toBeNull();
    expect(listKeyAction(k('ArrowDown'), false)).toBeNull();
    expect(listKeyAction(k(' ', { code: 'Space', ctrlKey: true }), false)).toBe('open');
    expect(listKeyAction(k(' ', { code: 'Space', ctrlKey: true }), true)).toBe('open');
  });

  it('ignores every key during IME composition', () => {
    expect(listKeyAction(k('Enter', { isComposing: true }), true)).toBeNull();
    expect(listKeyAction(k('Process', { keyCode: 229 }), true)).toBeNull();
    expect(listKeyAction(k('ArrowDown', { isComposing: true }), true)).toBeNull();
    expect(listKeyAction(k(' ', { code: 'Space', ctrlKey: true, isComposing: true }), false)).toBeNull();
  });

  it('does not accept with modifiers held', () => {
    expect(listKeyAction(k('Tab', { shiftKey: true }), true)).toBeNull();
    expect(listKeyAction(k('Enter', { ctrlKey: true }), true)).toBeNull();
    expect(listKeyAction(k('Enter', { metaKey: true }), true)).toBeNull();
    expect(listKeyAction(k('Enter', { altKey: true }), true)).toBeNull();
  });
});
