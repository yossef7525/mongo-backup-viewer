import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { useT } from '../i18n/react';
import { onlyGz } from './files';

interface Props {
  onFiles(files: File[]): void;
  variant: 'hero' | 'button';
  dragging?: boolean;
  children?: ReactNode;
}

const folderAttrs = { webkitdirectory: '' } as Record<string, string>;

export function FileDrop({ onFiles, variant, dragging = false, children }: Props) {
  const t = useT();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const list = onlyGz([...(e.target.files ?? [])]);
    e.target.value = '';
    if (list.length) onFiles(list);
  };
  const inputs = (
    <>
      <input ref={filesInput} type="file" multiple accept=".gz" hidden onChange={pick} />
      <input ref={folderInput} type="file" hidden onChange={pick} {...folderAttrs} />
    </>
  );

  if (variant === 'button') {
    return (
      <>
        {inputs}
        <button type="button" className="btn btn--small" onClick={() => filesInput.current?.click()}>
          {t('sidebar.addFiles')}
        </button>
      </>
    );
  }

  return (
    <div className={`dropzone${dragging ? ' dropzone--over' : ''}`}>
      {inputs}
      <svg className="dropzone__icon" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
        <path fill="currentColor" d="M12 3c-4.4 0-8 1.3-8 3v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3Zm0 2c3.9 0 6 1.1 6 1.5S15.9 8 12 8 6 6.9 6 6.5 8.1 5 12 5Zm6 13c0 .4-2.1 1.5-6 1.5S6 18.4 6 18v-2.3c1.5.8 3.7 1.3 6 1.3s4.5-.5 6-1.3V18Zm0-5c0 .4-2.1 1.5-6 1.5S6 13.4 6 13v-2.3c1.5.8 3.7 1.3 6 1.3s4.5-.5 6-1.3V13Z" />
      </svg>
      <p className="dropzone__title">{t('drop.title')}</p>
      <div className="dropzone__actions">
        <button type="button" className="btn btn--primary" onClick={() => filesInput.current?.click()}>
          {t('drop.chooseFiles')}
        </button>
        <span className="muted">{t('drop.or')}</span>
        <button type="button" className="btn" onClick={() => folderInput.current?.click()}>
          {t('drop.chooseFolder')}
        </button>
      </div>
      <p className="muted small">
        <bdi dir="ltr">{t('drop.hint')}</bdi>
      </p>
      {children}
    </div>
  );
}
