import { describe, expect, it } from 'vitest';
import { fileNameText, firstStrongDir, formatBytes, isolate, pct } from './format';

describe('format', () => {
  it('pct', () => {
    expect(pct(0, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 4)).toBe(100);
  });
  it('formatBytes', () => {
    expect(formatBytes(512, 'en')).toBe('512 byte');
    expect(formatBytes(1536, 'en')).toBe('1.5 kB');
    expect(formatBytes(45 * 1024 * 1024, 'en')).toBe('45 MB');
  });
  it('isolate wraps text in a first-strong isolate', () => {
    expect(isolate('315.2 kB')).toBe('\u2068315.2 kB\u2069');
  });
  it('fileNameText keeps the extension together in RTL names', () => {
    expect(fileNameText('גיבוי.gz')).toBe('גיבוי\u2066.gz\u2069');
    expect(fileNameText('backup.tar.gz')).toBe('backup.tar\u2066.gz\u2069');
    expect(fileNameText('README')).toBe('README');
  });
  it('firstStrongDir', () => {
    expect(firstStrongDir('לקוחות')).toBe('rtl');
    expect(firstStrongDir('عملاء')).toBe('rtl');
    expect(firstStrongDir('123 orders')).toBe('ltr');
    expect(firstStrongDir('_1 שם')).toBe('rtl');
    expect(firstStrongDir('12 - ')).toBeUndefined();
  });
});
