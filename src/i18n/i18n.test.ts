import { describe, expect, it } from 'vitest';
import { applyDocumentLocale, detectLocale, translate } from './i18n';

describe('translate', () => {
  it('interpolates and formats numbers per locale', () => {
    expect(translate('en', 'results.range', { from: 1, to: 50, total: 12345 })).toBe('1–50 of 12,345');
    expect(translate('de', 'results.range', { from: 1, to: 50, total: 12345 })).toContain('12.345');
  });

  it('selects plural forms', () => {
    expect(translate('en', 'collection.docCount', { count: 1 })).toBe('1 document');
    expect(translate('en', 'collection.docCount', { count: 3 })).toBe('3 documents');
    expect(translate('he', 'collection.docCount', { count: 3 })).not.toBe(translate('he', 'collection.docCount', { count: 1 }));
  });

  it('falls back to the key when missing', () => {
    expect(translate('en', 'nope.missing' as never)).toBe('nope.missing');
  });
});

describe('detectLocale', () => {
  it('prefers a valid stored choice', () => expect(detectLocale(['fr-FR'], 'ja')).toBe('ja'));
  it('uses the first supported browser language', () => expect(detectLocale(['xx', 'he-IL', 'en'], null)).toBe('he'));
  it('maps legacy iw to he', () => expect(detectLocale(['iw'], null)).toBe('he'));
  it('maps zh-TW/zh-CN to zh', () => expect(detectLocale(['zh-CN'], null)).toBe('zh'));
  it('defaults to en', () => expect(detectLocale(['xx'], 'bogus')).toBe('en'));
});

describe('applyDocumentLocale', () => {
  it('sets lang and dir', () => {
    const doc = { documentElement: { lang: '', dir: '' } } as unknown as Document;
    applyDocumentLocale('ar', doc);
    expect(doc.documentElement).toMatchObject({ lang: 'ar', dir: 'rtl' });
    applyDocumentLocale('fr', doc);
    expect(doc.documentElement).toMatchObject({ lang: 'fr', dir: 'ltr' });
  });
});
