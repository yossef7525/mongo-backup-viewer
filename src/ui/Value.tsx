import { describeValue } from './value';

export type Doc = Record<string, unknown>;

export function Value({ v, quoted = false }: { v: unknown; quoted?: boolean }) {
  const d = describeValue(v);
  const isString = d.kind === 'string';
  return (
    <span className={`v v--${d.kind}`} dir={isString ? 'auto' : 'ltr'}>
      {isString && quoted ? `"${d.text}"` : d.text}
    </span>
  );
}
