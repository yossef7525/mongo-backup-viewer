import { describeValue } from './value';

export type Doc = Record<string, unknown>;

export function Value({ v, quoted = false }: { v: unknown; quoted?: boolean }) {
  const d = describeValue(v);
  if (d.kind !== 'string') {
    return (
      <span className={`v v--${d.kind}`} dir="ltr">
        {d.text}
      </span>
    );
  }
  // In the (LTR) JSON view the quotes stay outside an isolate, so a Hebrew or Arabic string cannot flip them.
  return quoted ? (
    <span className="v v--string" dir="ltr">
      "<bdi>{d.text}</bdi>"
    </span>
  ) : (
    <span className="v v--string" dir="auto">
      {d.text}
    </span>
  );
}
