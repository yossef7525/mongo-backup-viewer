import { useLocale, useT } from '../i18n/react';
import type { ArchiveSummary, CollectionSummary, SummaryError } from '../worker/protocol';
import { FileDrop } from './FileDrop';

export interface LoadingFile {
  archiveId: number;
  /** The worker job opening this file, so the user can cancel it. */
  jobId: number;
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

/** Groups collections by database, keeping their (namespace-sorted) order. */
export function groupByDb(colls: CollectionSummary[]): [string, CollectionSummary[]][] {
  const groups = new Map<string, CollectionSummary[]>();
  for (const c of colls) {
    const list = groups.get(c.db);
    if (list) list.push(c);
    else groups.set(c.db, [c]);
  }
  return [...groups];
}

interface Props {
  archives: ArchiveSummary[];
  loading: LoadingFile[];
  selectedKey: string | null;
  onSelect(c: CollectionSummary): void;
  onRemove(archiveId: number): void;
  onCancelLoading(l: LoadingFile): void;
  onAddFiles(files: File[]): void;
}

export function Sidebar({ archives, loading, selectedKey, onSelect, onRemove, onCancelLoading, onAddFiles }: Props) {
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
          <div className="archive__head">
            <div className="archive__file" dir="auto">{l.fileName}</div>
            <button type="button" className="icon-btn" onClick={() => onCancelLoading(l)} aria-label={t('common.cancel')} title={t('common.cancel')}>
              ×
            </button>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={l.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress__bar" style={{ inlineSize: `${l.percent}%` }} />
          </div>
          <div className="muted small">{t('sidebar.reading', { percent: l.percent })}</div>
        </div>
      ))}
      {archives.map((a) => {
        const groups = groupByDb(a.collections);
        const multiDb = groups.length > 1;
        const collList = (colls: CollectionSummary[]) => (
          <ul className="colls">
            {colls.map((c) => (
              <li key={c.key}>
                <button type="button" className={`coll${c.key === selectedKey ? ' coll--active' : ''}`} aria-current={c.key === selectedKey || undefined} onClick={() => onSelect(c)}>
                  <span className="coll__name" dir="auto">{c.name}</span>
                  {!c.complete && <span className="badge badge--warn">{t('sidebar.partial')}</span>}
                  <span className="coll__count">{nf.format(c.count)}</span>
                </button>
              </li>
            ))}
          </ul>
        );
        return (
          <section key={a.archiveId} className="archive">
            <header className="archive__head">
              <div className="archive__titles">
                {multiDb ? (
                  <div className="archive__db" dir="auto">{a.fileName}</div>
                ) : (
                  <>
                    <div className="archive__db" dir="auto">{a.db ?? a.fileName}</div>
                    <div className="archive__file" dir="auto">{a.fileName}</div>
                  </>
                )}
              </div>
              <button type="button" className="icon-btn" onClick={() => onRemove(a.archiveId)} aria-label={t('sidebar.remove', { name: a.fileName })} title={t('sidebar.remove', { name: a.fileName })}>
                ×
              </button>
            </header>
            {a.error && <p className="archive__error" role="alert">{archiveErrorText(t, a.error)}</p>}
            {multiDb
              ? groups.map(([db, colls]) => (
                  <div key={db} className="dbgroup">
                    <h3 className="dbgroup__name" dir="auto">{db}</h3>
                    {collList(colls)}
                  </div>
                ))
              : collList(a.collections)}
          </section>
        );
      })}
    </aside>
  );
}
