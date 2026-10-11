import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/react';
import { EXPORT_FORMATS, exportFileInfo, type ExportFormat } from '../export/writers';
import type { QueryInput } from '../query/spec';
import { isAborted } from '../worker/client';
import type { CollectionSummary } from '../worker/protocol';
import { backend } from './backend';
import { firstStrongDir, isolate, pct } from './format';

declare global {
  interface Window {
    showSaveFilePicker?: (opts: { suggestedName?: string; types?: { description?: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;
  }
}

type Phase = { kind: 'idle' } | { kind: 'running'; percent: number; jobId: number } | { kind: 'done'; count: number } | { kind: 'error'; message: string };

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface Props {
  collection: CollectionSummary;
  input: QueryInput;
  count: number;
  onClose(): void;
}

export function ExportDialog({ collection, input, count, onClose }: Props) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [name, setName] = useState(collection.name);
  const [phase, setPhaseState] = useState<Phase>({ kind: 'idle' });
  const jobRef = useRef<number | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  const setPhase = (p: Phase) => {
    if (mounted.current) setPhaseState(p);
  };
  const { extension, mime } = exportFileInfo(format);
  const fileName = `${name.trim() || collection.name}${extension}`;

  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
      if (jobRef.current !== null) backend.cancel(jobRef.current);
    };
  }, []);

  const start = async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      await run();
    } finally {
      starting.current = false;
    }
  };

  const run = async () => {
    let target: FileSystemFileHandle | null = null;
    if (window.showSaveFilePicker) {
      try {
        target = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: t(`export.${format}`), accept: { [mime]: [extension] } }] });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // user closed the picker
        target = null; // picker blocked (e.g. in an iframe): fall back to a download
      }
    }
    const parts: string[] = [];
    const job = backend.call(
      { type: 'export', key: collection.key, input, format, target },
      {
        onProgress: (done, total) => setPhase({ kind: 'running', percent: pct(done, total), jobId: job.jobId }),
        onChunk: (text) => parts.push(text),
      },
    );
    jobRef.current = job.jobId;
    setPhase({ kind: 'running', percent: 0, jobId: job.jobId });
    try {
      const r = await job.promise;
      jobRef.current = null;
      if (!target) downloadBlob(new Blob(parts, { type: mime }), fileName);
      setPhase({ kind: 'done', count: r.count });
    } catch (e) {
      jobRef.current = null;
      setPhase(isAborted(e) ? { kind: 'idle' } : { kind: 'error', message: (e as Error).message });
    }
  };

  const running = phase.kind === 'running';

  return (
    <dialog
      ref={dialog}
      className="dialog"
      onClose={() => {
        if (jobRef.current !== null) backend.cancel(jobRef.current);
        onClose();
      }}
      onCancel={(e) => {
        if (running) e.preventDefault();
      }}
    >
      <h2>{t('export.title')}</h2>
      <fieldset className="formats" disabled={running}>
        <legend>{t('export.format')}</legend>
        {EXPORT_FORMATS.map((f) => (
          <label key={f} className={`format${f === format ? ' format--active' : ''}`}>
            <input type="radio" name="format" value={f} checked={f === format} onChange={() => setFormat(f)} />
            <span>
              <strong>{t(`export.${f}`)}</strong>
              <span className="muted small format__hint">{t(`export.${f}Hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="qfield">
        <span className="qfield__label">{t('export.fileName')}</span>
        {/* The extension follows the name's own direction: "orders.json" in any UI, ".json" before an RTL name. */}
        <span className="filename" dir={firstStrongDir(name)}>
          <input className="qfield__input" dir="auto" value={name} disabled={running} onChange={(e) => setName(e.target.value)} />
          <code dir="ltr">{extension}</code>
        </span>
      </label>
      <p className="muted">{t('export.willExport', { count })}</p>

      {phase.kind === 'running' && (
        <div>
          <div className="progress" role="progressbar" aria-valuenow={phase.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress__bar" style={{ inlineSize: `${phase.percent}%` }} />
          </div>
          <p className="small muted">{t('export.progress', { percent: phase.percent })}</p>
        </div>
      )}
      {phase.kind === 'done' && <p className="notice notice--ok">{t('export.done', { count: phase.count })}</p>}
      {phase.kind === 'error' && (
        <p className="notice notice--error" role="alert">
          {t('export.failed', { message: isolate(phase.message) })}
        </p>
      )}

      <div className="dialog__actions">
        {running ? (
          <button type="button" className="btn" onClick={() => backend.cancel(phase.jobId)}>
            {t('common.cancel')}
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>
              {phase.kind === 'done' ? t('common.close') : t('common.cancel')}
            </button>
            {phase.kind !== 'done' && (
              <button type="button" className="btn btn--primary" disabled={count === 0} onClick={() => void start()}>
                {t('export.start')}
              </button>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
