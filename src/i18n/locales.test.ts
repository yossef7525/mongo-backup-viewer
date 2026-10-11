import { describe, expect, it } from 'vitest';
import { LOCALES, MESSAGES } from './i18n';

const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/;
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const en = MESSAGES.en;
const enPlain = Object.keys(en).filter((k) => !PLURAL.test(k)).sort();
const enPluralBases = [...new Set(Object.keys(en).map((k) => PLURAL.exec(k)?.[1]).filter(Boolean) as string[])].sort();

describe.each(LOCALES.map((l) => l.code))('locale %s', (code) => {
  const msgs = MESSAGES[code];
  const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories as string[];

  it('has exactly the plain keys of en', () => {
    expect(Object.keys(msgs).filter((k) => !PLURAL.test(k)).sort()).toEqual(enPlain);
  });

  it('has every plural category the language needs, and no others', () => {
    for (const base of enPluralBases) {
      for (const cat of categories) expect(msgs[`${base}_${cat}`], `${base}_${cat}`).toBeTypeOf('string');
    }
    for (const k of Object.keys(msgs)) {
      const m = PLURAL.exec(k);
      if (m) {
        expect(enPluralBases).toContain(m[1]);
        expect(categories, k).toContain(m[2]);
      }
    }
  });

  it('keeps placeholders', () => {
    for (const k of enPlain) expect(placeholders(msgs[k]), k).toEqual(placeholders(en[k]));
    for (const k of Object.keys(msgs).filter((k) => PLURAL.test(k))) {
      const base = PLURAL.exec(k)![1];
      const expected = placeholders(en[`${base}_other`]);
      const got = placeholders(msgs[k]);
      for (const p of got) expect(expected, k).toContain(p);
      for (const p of expected) if (p !== 'count') expect(got, k).toContain(p);
    }
  });

  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(msgs)) expect(v.trim(), k).not.toBe('');
  });
});
