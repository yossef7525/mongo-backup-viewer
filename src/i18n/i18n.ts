import en from './locales/en.json';
import he from './locales/he.json';
import ar from './locales/ar.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';

export type LocaleCode = 'en' | 'he' | 'ar' | 'es' | 'fr' | 'de' | 'pt' | 'ru' | 'zh' | 'ja';

export interface LocaleInfo {
  code: LocaleCode;
  name: string;
  dir: 'ltr' | 'rtl';
}

export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'he', name: 'עברית', dir: 'rtl' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'pt', name: 'Português', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'zh', name: '简体中文', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
];

type StripPlural<K> = K extends `${infer B}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}` ? B : K;
export type MessageKey = StripPlural<keyof typeof en>;
export type Params = Record<string, string | number>;

export const MESSAGES: Record<LocaleCode, Record<string, string>> = { en, he, ar, es, fr, de, pt, ru, zh, ja };

function lookup(locale: LocaleCode, key: string, count: number | undefined): string | undefined {
  const msgs = MESSAGES[locale];
  if (count !== undefined) {
    const form = msgs[`${key}_${new Intl.PluralRules(locale).select(count)}`] ?? msgs[`${key}_other`];
    if (form !== undefined) return form;
  }
  return msgs[key];
}

export function translate(locale: LocaleCode, key: MessageKey, params: Params = {}): string {
  const count = typeof params.count === 'number' ? params.count : undefined;
  const template = lookup(locale, key, count) ?? lookup('en', key, count) ?? key;
  const nf = new Intl.NumberFormat(locale);
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    if (v === undefined) return match;
    return typeof v === 'number' ? nf.format(v) : v;
  });
}

export function localeInfo(code: LocaleCode): LocaleInfo {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

const isLocale = (c: string | null): c is LocaleCode => !!c && LOCALES.some((l) => l.code === c);

export function detectLocale(preferred: readonly string[], stored: string | null): LocaleCode {
  if (isLocale(stored)) return stored;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'iw') return 'he';
    if (isLocale(base)) return base;
  }
  return 'en';
}

export function applyDocumentLocale(code: LocaleCode, doc: Document = document): void {
  doc.documentElement.lang = code;
  doc.documentElement.dir = localeInfo(code).dir;
}

const STORAGE_KEY = 'mbv.locale';

export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLocale(code: LocaleCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}
