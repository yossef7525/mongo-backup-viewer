import { useState } from 'react';
import type { MessageKey } from '../i18n/i18n';
import { useT } from '../i18n/react';
import type { QueryError, QueryField, QueryInput } from '../query/spec';
import { isolate } from './format';

type T = ReturnType<typeof useT>;

export function queryErrorText(t: T, e: QueryError): string {
  switch (e.code) {
    case 'invalidJson':
      return t('query.invalidJson', { detail: isolate(e.detail) });
    case 'notObject':
      return t('query.notObject');
    case 'invalidNumber':
      return t('query.invalidNumber');
    case 'invalidSort':
      return t('query.invalidSort');
  }
}

interface Props {
  value: QueryInput;
  errors: Partial<Record<QueryField, QueryError>>;
  onChange(v: QueryInput): void;
  onSubmit(): void;
  onReset(): void;
}

export function QueryBar({ value, errors, onChange, onSubmit, onReset }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const showOptions = open || !!(errors.projection || errors.sort || errors.skip || errors.limit);

  const field = (name: QueryField, label: MessageKey, placeholder: string, narrow = false) => {
    const error = errors[name];
    return (
      <label className={`qfield${narrow ? ' qfield--narrow' : ''}`}>
        <span className="qfield__label">{t(label)}</span>
        <input
          className={`qfield__input${error ? ' qfield__input--error' : ''}`}
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          inputMode={narrow ? 'numeric' : undefined}
          value={value[name]}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? `qerr-${name}` : undefined}
          onChange={(e) => onChange({ ...value, [name]: e.target.value })}
        />
        {error && (
          <span id={`qerr-${name}`} className="qfield__error">
            {queryErrorText(t, error)}
          </span>
        )}
      </label>
    );
  };

  return (
    <form
      className="querybar"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="querybar__row">
        {field('filter', 'query.filter', '{ status: "paid", total: { $gt: 100 } }')}
        <div className="querybar__buttons">
          <button type="button" className="btn btn--ghost" aria-expanded={showOptions} onClick={() => setOpen((o) => !o)}>
            {t('query.options')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            {t('query.reset')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('query.find')}
          </button>
        </div>
      </div>
      {showOptions && (
        <div className="querybar__row">
          {field('projection', 'query.projection', '{ name: 1, _id: 0 }')}
          {field('sort', 'query.sort', '{ createdAt: -1 }')}
          {field('skip', 'query.skip', '0', true)}
          {field('limit', 'query.limit', '0', true)}
        </div>
      )}
    </form>
  );
}
