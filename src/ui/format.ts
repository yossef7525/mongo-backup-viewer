export const pct = (done: number, total: number) => (total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0);

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

export function formatBytes(bytes: number, locale: string): string {
  let value = bytes;
  let u = 0;
  while (value >= 1024 && u < UNITS.length - 1) {
    value /= 1024;
    u++;
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: UNITS[u], unitDisplay: 'short', maximumFractionDigits: u === 0 ? 0 : 1 }).format(value);
}

/**
 * Wraps text in a first-strong isolate (U+2068…U+2069) so an LTR value such as "315.2 kB" or an
 * English error message keeps its own order inside a Hebrew or Arabic sentence.
 */
export const isolate = (text: string) => `\u2068${text}\u2069`;

/** Keeps a file extension visually attached (".gz", not "gz.") when the name is shown right-to-left. */
export const fileNameText = (name: string) => name.replace(/(\.[^.\s]+)$/, '\u2066$1\u2069');

const STRONG = /\p{L}/u;
const RTL_SCRIPT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/** The direction of the first strong letter (what dir="auto" would pick), or undefined when there is none. */
export function firstStrongDir(text: string): 'ltr' | 'rtl' | undefined {
  for (const ch of text) if (STRONG.test(ch)) return RTL_SCRIPT.test(ch) ? 'rtl' : 'ltr';
  return undefined;
}
