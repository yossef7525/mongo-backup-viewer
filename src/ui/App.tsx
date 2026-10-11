import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/react';
import type { ArchiveSummary, CollectionSummary } from '../worker/protocol';
import { backend } from './backend';
import { CollectionView } from './CollectionView';
import { FileDrop } from './FileDrop';
import { filesFromDataTransfer } from './files';
import { pct } from './format';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Sidebar, type LoadingFile } from './Sidebar';

export const REPO_URL = 'https://github.com/yossef7525/mongo-backup-viewer';

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
      setLoading((l) => [...l, { archiveId, fileName: file.name, percent: 0 }]);
      backend
        .call(
          { type: 'open', archiveId, file },
          { onProgress: (done, total) => setLoading((l) => l.map((x) => (x.archiveId === archiveId ? { ...x, percent: pct(done, total) } : x))) },
        )
        .promise.then((r) => setArchives((a) => [...a, r.archive].sort((x, y) => x.fileName.localeCompare(y.fileName))))
        .catch((e: Error) =>
          setArchives((a) => [...a, { archiveId, fileName: file.name, db: null, serverVersion: null, collections: [], error: { code: 'generic', message: e.message } }]),
        )
        .finally(() => setLoading((l) => l.filter((x) => x.archiveId !== archiveId)));
    }
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
      // (an archive starts with 81 99 e2 6d). Anything else, e.g. an SPA index.html fallback, is not the demo.
      const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      const isGzip = head[0] === 0x1f && head[1] === 0x8b;
      if (!isGzip) {
        if (head[0] !== 0x81 || head[1] !== 0x99) throw new Error('demo.gz is not a mongodump archive');
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
          <a className="muted" href={REPO_URL} target="_blank" rel="noreferrer">
            {t('app.sourceCode')}
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
        </main>
      ) : (
        <div className="workspace">
          <Sidebar archives={archives} loading={loading} selectedKey={selected?.key ?? null} onSelect={setSelected} onRemove={removeArchive} onAddFiles={addFiles} />
          <main className="main">
            {selected ? <CollectionView key={selected.key} collection={selected} /> : <p className="placeholder">{t('results.selectCollection')}</p>}
          </main>
          {dragging && <div className="drop-overlay">{t('drop.title')}</div>}
        </div>
      )}
    </div>
  );
}
