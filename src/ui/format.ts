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
