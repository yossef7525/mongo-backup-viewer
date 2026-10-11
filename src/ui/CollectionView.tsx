import { useEffect, useState } from 'react';
import { useLocale, useT } from '../i18n/react';
import { EMPTY_INPUT, parseQuerySpec, type QueryError, type QueryField, type QueryInput } from '../query/spec';
import { isAborted } from '../worker/client';
import type { CollectionSummary } from '../worker/protocol';
import { backend } from './backend';
import { formatBytes, pct } from './format';
import { JsonTree } from './JsonTree';
import { Pager } from './Pager';
import { QueryBar } from './QueryBar';
import { ResultsTable } from './ResultsTable';
import type { Doc } from './Value';

const PAGE_SIZE = 50;

type Status = { kind: 'running'; percent: number } | { kind: 'ready'; matched: number; returned: number; input: QueryInput } | { kind: 'error'; message: string };

export function CollectionView({ collection }: { collection: CollectionSummary }) {
  const t = useT();
  const { locale } = useLocale();
  const [draft, setDraft] = useState<QueryInput>(EMPTY_INPUT);
  const [applied, setApplied] = useState<QueryInput>(EMPTY_INPUT);
  const [errors, setErrors] = useState<Partial<Record<QueryField, QueryError>>>({});
  const [status, setStatus] = useState<Status>({ kind: 'running', percent: 0 });
  const [page, setPage] = useState(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [view, setView] = useState<'table' | 'json'>('table');

  useEffect(() => {
    const input = applied;
    let alive = true;
    setStatus({ kind: 'running', percent: 0 });
    setPage(0);
    setDocs([]);
    const job = backend.call(
      { type: 'query', key: collection.key, input },
      { onProgress: (done, total) => alive && setStatus({ kind: 'running', percent: pct(done, total) }) },
    );
    job.promise
      .then((r) => alive && setStatus({ kind: 'ready', matched: r.matched, returned: r.returned, input }))
      .catch((e: unknown) => alive && !isAborted(e) && setStatus({ kind: 'error', message: (e as Error).message }));
    return () => {
      alive = false;
      backend.cancel(job.jobId);
    };
  }, [collection.key, applied]);

  // Only fetch pages once the query result belongs to the currently applied input;
  // otherwise a stale 'ready' commit would start a duplicate full scan in the worker.
  const readyInput = status.kind === 'ready' ? status.input : null;
  const ready = status.kind === 'ready' && status.input === applied;
  useEffect(() => {
    if (readyInput === null || readyInput !== applied) return;
    let alive = true;
    const job = backend.call({ type: 'page', key: collection.key, input: applied, offset: page * PAGE_SIZE, size: PAGE_SIZE });
    job.promise.then((r) => alive && setDocs(r.docs))
      .catch((e: unknown) => alive && !isAborted(e) && setStatus({ kind: 'error', message: (e as Error).message }));
    return () => {
      alive = false;
      backend.cancel(job.jobId);
    };
  }, [readyInput, page, collection.key, applied]);

  const submit = () => {
    const r = parseQuerySpec(draft);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setApplied({ ...draft });
  };
  const reset = () => {
    setDraft(EMPTY_INPUT);
    setErrors({});
    setApplied({ ...EMPTY_INPUT });
  };

  return (
    <section className="collection">
      <header className="collection__head">
        <div className="collection__titles">
          <h2 dir="auto">
            <span className="muted">{collection.db}.</span>
            {collection.name}
          </h2>
          <p className="muted small">
            {t('collection.docCount', { count: collection.count })} · {t('collection.size', { size: formatBytes(collection.bytes, locale) })}
          </p>
        </div>
        <div className="collection__actions" data-slot="export" />
      </header>

      {collection.indexes.length > 0 && (
        <div className="indexes">
          <span className="muted small">{t('collection.indexes')}:</span>
          {collection.indexes.map((ix) => (
            <code key={ix.name} className="chip" dir="ltr" title={JSON.stringify(ix.key)}>
              {ix.name}
            </code>
          ))}
        </div>
      )}
      {!collection.complete && <p className="notice notice--warn">{t('collection.partialNote')}</p>}

      <QueryBar value={draft} errors={errors} onChange={setDraft} onSubmit={submit} onReset={reset} />

      <div className="results-head">
        <span aria-live="polite">
          {status.kind === 'running' && t('results.searching', { percent: status.percent })}
          {status.kind === 'ready' && t('results.matched', { count: status.matched })}
        </span>
        <div className="segmented" role="group">
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            {t('results.viewTable')}
          </button>
          <button type="button" aria-pressed={view === 'json'} onClick={() => setView('json')}>
            {t('results.viewJson')}
          </button>
        </div>
      </div>

      {status.kind === 'running' && (
        <div className="progress" role="progressbar" aria-valuenow={status.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress__bar" style={{ inlineSize: `${status.percent}%` }} />
        </div>
      )}
      {status.kind === 'error' && (
        <p className="notice notice--error" role="alert">
          {t('error.generic', { message: status.message })}
        </p>
      )}
      {ready && status.returned === 0 && <p className="placeholder">{t('results.empty')}</p>}
      {ready && docs.length > 0 && (view === 'table' ? <ResultsTable docs={docs} /> : <JsonTree docs={docs} />)}
      {ready && status.returned > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={status.returned} onPage={setPage} />}
    </section>
  );
}
