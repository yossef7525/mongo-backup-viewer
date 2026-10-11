import { describe, expect, it } from 'vitest';
import { formatBytes, pct } from './format';

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
});
