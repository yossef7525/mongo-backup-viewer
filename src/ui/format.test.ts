import { describe, expect, it } from 'vitest';
import { formatBytes, pct } from './format';
import { onlyGz } from './files';

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
  it('onlyGz keeps .gz files sorted', () => {
    const f = (n: string) => new File([], n);
    expect(onlyGz([f('b.gz'), f('notes.txt'), f('A.GZ'), f('a.gz')]).map((x) => x.name)).toEqual(['a.gz', 'A.GZ', 'b.gz']);
  });
});
