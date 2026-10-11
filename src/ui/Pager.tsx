import { useLocale, useT } from '../i18n/react';

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage(p: number): void }) {
  const t = useT();
  const { locale } = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  // The "{from}–{to}" range is wrapped in an LTR isolate (U+2066…U+2069) so it keeps its numeric order in RTL text.
  return (
    <nav className="pager">
      <button type="button" className="btn btn--small" disabled={page === 0} onClick={() => onPage(page - 1)}>
        {t('results.previous')}
      </button>
      <span className="pager__range">{t('results.range', { from: `\u2066${nf.format(from)}`, to: `${nf.format(to)}\u2069`, total })}</span>
      <button type="button" className="btn btn--small" disabled={page >= last} onClick={() => onPage(page + 1)}>
        {t('results.next')}
      </button>
    </nav>
  );
}
