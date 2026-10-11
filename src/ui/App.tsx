import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/react';
import { isAborted } from '../worker/client';
import type { ArchiveSummary, CollectionSummary } from '../worker/protocol';
import { backend } from './backend';
import { CollectionView } from './CollectionView';
import { FileDrop } from './FileDrop';
import { filesFromDataTransfer } from './files';
import { pct } from './format';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Sidebar, type LoadingFile } from './Sidebar';

export const REPO_URL = 'https://github.com/yossef7525/mongo-backup-viewer';

function StarIcon() {
  return (
    <svg className="star-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
    </svg>
  );
}

export function App() {
  const t = useT();
  const [archives, setArchives] = useState<ArchiveSummary[]>([]);
  const [loading, setLoading] = useState<LoadingFile[]>([]);
  const [selected, setSelected] = useState<CollectionSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(1);

  const addFiles = useCallback((files: File[]) => {
    for (const file of files) {
      const archiveId = nextId.current++;
      const job = backend.call(
        { type: 'open', archiveId, file },
        { onProgress: (done, total) => setLoading((l) => l.map((x) => (x.archiveId === archiveId ? { ...x, percent: pct(done, total) } : x))) },
      );
      setLoading((l) => [...l, { archiveId, jobId: job.jobId, fileName: file.name, percent: 0 }]);
      job.promise
        .then((r) => setArchives((a) => [...a, r.archive].sort((x, y) => x.fileName.localeCompare(y.fileName))))
        .catch((e: Error) => {
          if (isAborted(e)) return; // cancelled from the sidebar
          setArchives((a) => [...a, { archiveId, fileName: file.name, db: null, serverVersion: null, collections: [], error: { code: 'generic', message: e.message } }]);
        })
        .finally(() => setLoading((l) => l.filter((x) => x.archiveId !== archiveId)));
    }
  }, []);

  const cancelLoading = useCallback((l: LoadingFile) => {
    backend.cancel(l.jobId);
    setLoading((all) => all.filter((x) => x.archiveId !== l.archiveId));
  }, []);

  const removeArchive = useCallback((archiveId: number) => {
    void backend.call({ type: 'close', archiveId }).promise.catch(() => {});
    setArchives((a) => a.filter((x) => x.archiveId !== archiveId));
    setSelected((s) => (s && s.key.startsWith(`${archiveId}/`) ? null : s));
  }, []);

  const demoRequested = useRef(false);
  const demoLoading = useRef(false);
  const loadDemo = useCallback(async () => {
    if (demoLoading.current) return;
    demoLoading.current = true;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}demo.gz`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let blob = await res.blob();
      // Some static servers (e.g. vite preview) send .gz with Content-Encoding: gzip, so fetch hands back the inflated bytes
      // (an archive starts with 6d e2 99 81, the little-endian magic 0x8199e26d). Anything else, e.g. an SPA index.html fallback, is not the demo.
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      const isGzip = head[0] === 0x1f && head[1] === 0x8b;
      if (!isGzip) {
        if (head[0] !== 0x6d || head[1] !== 0xe2 || head[2] !== 0x99 || head[3] !== 0x81) throw new Error('demo.gz is not a mongodump archive');
        if (typeof CompressionStream === 'undefined') throw new Error('This browser cannot prepare the demo (CompressionStream missing)');
        blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
      }
      addFiles([new File([blob], 'demo-shop.gz')]);
    } catch (e) {
      const archiveId = nextId.current++;
      const message = e instanceof Error ? e.message : String(e);
      setArchives((a) => [...a, { archiveId, fileName: 'demo-shop.gz', db: null, serverVersion: null, collections: [], error: { code: 'generic', message } }]);
    } finally {
      demoLoading.current = false;
    }
  }, [addFiles]);

  useEffect(() => {
    if (demoRequested.current || !new URLSearchParams(location.search).has('demo')) return;
    demoRequested.current = true; // StrictMode runs effects twice in dev
    void loadDemo();
  }, [loadDemo]);

  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get('demo');
    if (!wanted || selected) return;
    const match = archives.flatMap((a) => a.collections).find((c) => c.name === wanted);
    if (match) setSelected(match);
  }, [archives, selected]);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      setDragging(false);
      void filesFromDataTransfer(e.dataTransfer).then((files) => files.length && addFiles(files));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [addFiles]);

  const empty = archives.length === 0 && loading.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={24} height={24} />
          <h1>{t('app.title')}</h1>
          <span className="badge badge--ok">{t('app.privacy')}</span>
        </div>
        <div className="topbar__end">
          <a className="repo-link" href={REPO_URL} target="_blank" rel="noreferrer" title={t('app.sourceCode')} aria-label={t('app.sourceCode')}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="repo-link__text">{t('app.sourceCode')}</span>
          </a>
          <a className="repo-link repo-link--star" href={REPO_URL} target="_blank" rel="noopener" title={t('app.star')} aria-label={t('app.star')}>
            <StarIcon />
            <span className="repo-link__text">{t('app.starShort')}</span>
          </a>
          <LanguageSwitcher />
        </div>
      </header>
      {empty ? (
        <main className="welcome">
          <p className="tagline">{t('app.tagline')}</p>
          <FileDrop variant="hero" dragging={dragging} onFiles={addFiles}>
            <button type="button" className="btn btn--ghost" onClick={() => void loadDemo()}>
              {t('drop.tryDemo')}
            </button>
          </FileDrop>
          <a className="star-note" href={REPO_URL} target="_blank" rel="noopener">
            <StarIcon />
            {t('app.star')}
          </a>
        </main>
      ) : (
        <div className="workspace">
          <Sidebar archives={archives} loading={loading} selectedKey={selected?.key ?? null} onSelect={setSelected} onRemove={removeArchive} onCancelLoading={cancelLoading} onAddFiles={addFiles} />
          <main className="main">
            {selected ? <CollectionView key={selected.key} collection={selected} /> : <p className="placeholder">{t('results.selectCollection')}</p>}
          </main>
          {dragging && <div className="drop-overlay">{t('drop.title')}</div>}
        </div>
      )}
    </div>
  );
}
