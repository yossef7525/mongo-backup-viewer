import type { FieldPath } from '../worker/fields';
import { OPERATORS } from './operators';

export type CompletionKind = 'key' | 'operator' | 'value' | 'none';

export interface CompletionContext {
  kind: CompletionKind;
  /** The text typed so far (for a quoted key, without the opening quote). */
  prefix: string;
  /** The range a suggestion replaces: the whole word or quoted key under the caret. */
  replaceFrom: number;
  replaceTo: number;
  /**
   * For keys and operators: the field whose object holds the key (absent at the top level and
   * inside $and/$or/$nor). For values: the field the value is compared with.
   */
  fieldPath?: string;
  /** Set when completing a quoted key. */
  quote?: '"' | "'";
}

export type QueryMode = 'filter' | 'projection' | 'sort';

export interface Suggestion {
  kind: 'field' | 'operator' | 'helper';
  label: string;
  detail: string;
  /** Text inserted for helpers; keys and operators are inserted as `label: `. */
  insert: string;
  /** How far before the end of `insert` the caret lands. */
  caretBack: number;
}

type Frame =
  | { kind: 'obj'; field?: string; expect: 'key' | 'colon' | 'value' | 'after'; key?: string }
  | { kind: 'arr'; field?: string; expect: 'value' | 'after' }
  | { kind: 'call' };

const NONE = (caret: number): CompletionContext => ({ kind: 'none', prefix: '', replaceFrom: caret, replaceTo: caret });
const WORD = /[\w$.+\-]/;
const join = (parent: string | undefined, key: string) => (parent ? `${parent}.${key}` : key);

/** The field a value at the current position belongs to. */
function valueField(f: Frame | undefined): string | undefined {
  if (!f || f.kind === 'call') return undefined;
  if (f.kind === 'arr') return f.field;
  return f.key === undefined || f.key.startsWith('$') ? f.field : join(f.field, f.key);
}

function make(kind: 'key' | 'value', prefix: string, from: number, to: number, field: string | undefined, quote?: '"' | "'"): CompletionContext {
  const c: CompletionContext = { kind: kind === 'key' && prefix.startsWith('$') ? 'operator' : kind, prefix, replaceFrom: from, replaceTo: to };
  if (field !== undefined) c.fieldPath = field;
  if (quote) c.quote = quote;
  return c;
}

/**
 * Works out what can be completed at `caret` in a mongo-shell style object literal:
 * a key, an operator, a value, or nothing (e.g. inside a string literal).
 */
export function completionContext(text: string, caret: number): CompletionContext {
  const stack: Frame[] = [];
  const top = () => stack[stack.length - 1];
  /** Marks the value or key just consumed in the current container. */
  const consumed = (word?: string) => {
    const f = top();
    if (!f || f.kind === 'call') return;
    if (f.kind === 'obj' && f.expect === 'key') {
      f.key = word;
      f.expect = 'colon';
    } else f.expect = 'after';
  };

  let i = 0;
  while (i < caret) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      const closed = j < text.length;
      const end = closed ? j + 1 : text.length;
      if (caret < end || (!closed && caret <= end)) {
        const f = top();
        if (f?.kind === 'obj' && f.expect === 'key') return make('key', text.slice(i + 1, caret), i, end, f.field, ch);
        return NONE(caret);
      }
      consumed(text.slice(i + 1, j));
      i = end;
      continue;
    }
    if (WORD.test(ch)) {
      let j = i;
      while (j < text.length && WORD.test(text[j])) j++;
      if (caret <= j) {
        const f = top();
        if (!f || f.kind === 'call' || f.expect === 'colon' || f.expect === 'after') return NONE(caret);
        const kind = f.kind === 'obj' && f.expect === 'key' ? 'key' : 'value';
        return make(kind, text.slice(i, caret), i, j, kind === 'key' ? f.field : valueField(f));
      }
      consumed(text.slice(i, j));
      i = j;
      continue;
    }
    const f = top();
    switch (ch) {
      case '{':
        stack.push({ kind: 'obj', field: valueField(f), expect: 'key' });
        break;
      case '[':
        stack.push({ kind: 'arr', field: valueField(f), expect: 'value' });
        break;
      case '(':
        stack.push({ kind: 'call' });
        break;
      case '}':
      case ']':
      case ')':
        stack.pop();
        if (ch !== ')') consumed();
        break;
      case ':':
        if (f?.kind === 'obj') f.expect = 'value';
        break;
      case ',':
        if (f?.kind === 'obj') {
          f.expect = 'key';
          f.key = undefined;
        } else if (f?.kind === 'arr') f.expect = 'value';
        break;
    }
    i++;
  }

  const f = top();
  if (!f || f.kind === 'call') return NONE(caret);
  if (f.kind === 'obj' && f.expect === 'key') return make('key', '', caret, caret, f.field);
  if (f.expect === 'value') return make('value', '', caret, caret, valueField(f));
  return NONE(caret);
}

/** Match quality of `label` for `prefix`: lower is better, -1 is no match. */
function matchTier(label: string, prefix: string, loose: boolean): number {
  if (label.startsWith(prefix)) return 0;
  const l = label.toLowerCase();
  const p = prefix.toLowerCase();
  if (l.startsWith(p)) return 1;
  if (!loose) return -1;
  if (l.split('.').some((seg, n) => n > 0 && seg.startsWith(p))) return 2;
  if (p.length >= 2 && l.includes(p)) return 3;
  return -1;
}

function rank(items: Suggestion[], prefix: string, loose: boolean, extra: (s: Suggestion) => number = () => 0): Suggestion[] {
  return items
    .map((s, n) => ({ s, n, tier: matchTier(s.label, prefix, loose && s.kind === 'field'), extra: extra(s) }))
    .filter((x) => x.tier >= 0)
    .sort((a, b) => a.tier - b.tier || a.extra - b.extra || a.n - b.n)
    .map((x) => x.s);
}

const fieldItems = (paths: FieldPath[], under?: string): Suggestion[] =>
  paths.flatMap(({ path, types }) => {
    if (under !== undefined && !path.startsWith(`${under}.`)) return [];
    const label = under !== undefined ? path.slice(under.length + 1) : path;
    return [{ kind: 'field' as const, label, detail: types.join(' | '), insert: label, caretBack: 0 }];
  });

const operatorItems = (scope: 'logical' | 'field'): Suggestion[] =>
  OPERATORS.filter((o) => o.scope === scope).map((o) => ({ kind: 'operator', label: o.name, detail: o.detail, insert: o.name, caretBack: 0 }));

const helper = (label: string, type: string, caretBack = 0): Suggestion & { type: string } => ({ kind: 'helper', label, detail: type, insert: label, caretBack, type });

const HELPERS = [
  helper('ObjectId("")', 'objectId', 2),
  helper('ISODate("")', 'date', 2),
  helper('NumberDecimal("")', 'decimal', 2),
  helper('NumberLong()', 'long', 1),
  helper('true', 'bool'),
  helper('false', 'bool'),
  helper('null', 'null'),
];

const SORT_VALUES = [helper('1', 'ascending'), helper('-1', 'descending')];
const PROJECTION_VALUES = [helper('1', 'include'), helper('0', 'exclude')];

/** Ranked suggestions for a completion context. */
export function suggest(ctx: CompletionContext, mode: QueryMode, paths: FieldPath[]): Suggestion[] {
  switch (ctx.kind) {
    case 'none':
      return [];
    case 'key':
    case 'operator': {
      const fields = fieldItems(paths, ctx.fieldPath);
      if (mode !== 'filter') return ctx.kind === 'operator' ? [] : rank(fields, ctx.prefix, true);
      const items = ctx.fieldPath === undefined ? [...fields, ...operatorItems('logical')] : [...operatorItems('field'), ...fields];
      return rank(items, ctx.prefix, true);
    }
    case 'value': {
      if (mode === 'sort') return rank(SORT_VALUES, ctx.prefix, false);
      if (mode === 'projection') return rank(PROJECTION_VALUES, ctx.prefix, false);
      const types = paths.find((p) => p.path === ctx.fieldPath)?.types ?? [];
      return rank(HELPERS, ctx.prefix, false, (s) => {
        const n = types.indexOf((s as (typeof HELPERS)[number]).type);
        return n < 0 ? Infinity : n;
      });
    }
  }
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Inserts a suggestion, returning the new text and caret position. */
export function applySuggestion(text: string, ctx: CompletionContext, s: Suggestion): { text: string; caret: number } {
  const before = text.slice(0, ctx.replaceFrom);
  const after = text.slice(ctx.replaceTo);
  let insert: string;
  let caret: number;
  if (s.kind === 'helper') {
    insert = s.insert;
    caret = before.length + insert.length - s.caretBack;
  } else {
    const q = ctx.quote ?? (IDENTIFIER.test(s.label) ? '' : '"');
    insert = `${q}${s.label}${q}`;
    if (!/^\s*:/.test(after)) insert += ': ';
    caret = before.length + insert.length;
  }
  return { text: before + insert + after, caret };
}

/** Whether typing should open the list by itself (Ctrl+Space opens it anywhere a context exists). */
export function shouldAutoOpen(text: string, ctx: CompletionContext): boolean {
  if (ctx.kind === 'none') return false;
  if (ctx.prefix.length > 0) return true;
  if (ctx.kind === 'value') return false;
  const prev = text.slice(0, ctx.replaceFrom).trimEnd().at(-1);
  return prev === '{' || prev === ',';
}
