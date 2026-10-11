import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES } from './i18n/i18n';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const BASE = 'https://yossef7525.github.io/mongo-backup-viewer/';

describe('index.html SEO', () => {
  it('has valid WebApplication JSON-LD', () => {
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const ld = JSON.parse(m![1]);
    expect(ld['@type']).toBe('WebApplication');
    expect(ld.name).toBe('Mongo Backup Viewer');
    expect(ld.url).toBe(BASE);
    expect(ld.inLanguage).toEqual(LOCALES.map((l) => l.code));
  });

  it('has canonical and an hreflang alternate for every locale plus x-default', () => {
    expect(html).toContain(`<link rel="canonical" href="${BASE}" />`);
    for (const { code } of LOCALES) expect(html).toContain(`hreflang="${code}" href="${BASE}?lang=${code}"`);
    expect(html).toContain(`hreflang="x-default" href="${BASE}"`);
  });

  it('ships crawlable fallback content inside #root', () => {
    const root = /<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/.exec(html);
    expect(root?.[1]).toMatch(/<h1>Mongo Backup Viewer<\/h1>/);
    expect(root?.[1]).toContain('mongodump --archive=backup.gz --gzip');
  });
});
