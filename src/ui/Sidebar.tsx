import { useLocale, useT } from '../i18n/react';
import type { ArchiveSummary, CollectionSummary, SummaryError } from '../worker/protocol';
import { FileDrop } from './FileDrop';

export interface LoadingFile {
  archiveId: number;
  fileName: string;
  percent: number;
}

type T = ReturnType<typeof useT>;

export function archiveErrorText(t: T, e: SummaryError): string {
  switch (e.code) {
    case 'notGzip':
      return t('error.notGzip');
    case 'notArchive':
      return t('error.notArchive');
    case 'truncated':
      return t('error.truncated');
    case 'corrupt':
      return t('error.corrupt', { offset: e.offset ?? 0 });
    default:
      return t('error.generic', { message: e.message });
  }
}

interface Props {
  archives: ArchiveSummary[];
  loading: LoadingFile[];
  selectedKey: string | null;
  onSelect(c: CollectionSummary): void;
  onRemove(archiveId: number): void;
  onAddFiles(files: File[]): void;
}

export function Sidebar({ archives, loading, selectedKey, onSelect, onRemove, onAddFiles }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const nf = new Intl.NumberFormat(locale);
  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <h2>{t('sidebar.databases')}</h2>
        <FileDrop variant="button" onFiles={onAddFiles} />
      </div>
      {loading.map((l) => (
        <div key={l.archiveId} className="archive">
          <div className="archive__file" dir="auto">{l.fileName}</div>
          <div className="progress" role="progressbar" aria-valuenow={l.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress__bar" style={{ inlineSize: `${l.percent}%` }} />
          </div>
          <div className="muted small">{t('sidebar.reading', { percent: l.percent })}</div>
        </div>
      ))}
      {archives.map((a) => (
        <section key={a.archiveId} className="archive">
          <header className="archive__head">
            <div className="archive__titles">
              <div className="archive__db" dir="auto">{a.db ?? a.fileName}</div>
              <div className="archive__file" dir="auto">{a.fileName}</div>
            </div>
            <button type="button" className="icon-btn" onClick={() => onRemove(a.archiveId)} aria-label={t('sidebar.remove', { name: a.fileName })} title={t('sidebar.remove', { name: a.fileName })}>
              ×
            </button>
          </header>
          {a.error && <p className="archive__error" role="alert">{archiveErrorText(t, a.error)}</p>}
          <ul className="colls">
            {a.collections.map((c) => (
              <li key={c.key}>
                <button type="button" className={`coll${c.key === selectedKey ? ' coll--active' : ''}`} aria-current={c.key === selectedKey || undefined} onClick={() => onSelect(c)}>
                  <span className="coll__name" dir="auto">{c.name}</span>
                  {!c.complete && <span className="badge badge--warn">{t('sidebar.partial')}</span>}
                  <span className="coll__count">{nf.format(c.count)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
