import { useT } from '../i18n/react';

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage(p: number): void }) {
  const t = useT();
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className="pager">
      <button type="button" className="btn btn--small" disabled={page === 0} onClick={() => onPage(page - 1)}>
        {t('results.previous')}
      </button>
      <span className="pager__range">{t('results.range', { from, to, total })}</span>
      <button type="button" className="btn btn--small" disabled={page >= last} onClick={() => onPage(page + 1)}>
        {t('results.next')}
      </button>
    </nav>
  );
}
