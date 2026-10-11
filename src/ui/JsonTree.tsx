import { useState } from 'react';
import { useT } from '../i18n/react';
import { describeValue, isBranch } from './value';
import { Value, type Doc } from './Value';

/** One key/value of the tree; branches are collapsible and start open for the first two levels. */
export function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const view = describeValue(value);
  // The key is isolated and the colon stays outside it, so an RTL key reads "שם: …" and not ":שם…".
  const label = name !== undefined && (
    <span className="jt__key">
      <bdi>{name}</bdi>
      {': '}
    </span>
  );
  if (!isBranch(view)) {
    return (
      <div className="jt__row">
        {label}
        <Value v={value} quoted />
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Doc);
  return (
    <details className="jt__branch" open={depth < 2}>
      <summary>
        {label}
        <span className="jt__meta">{view.text}</span>
      </summary>
      <div className="jt__children">
        {entries.map(([k, v]) => (
          <JsonNode key={k} name={k} value={v} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

function DocCard({ doc }: { doc: Doc }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permission denied: nothing to do */
    }
  };
  return (
    <div className="doccard" dir="ltr">
      <button type="button" className="btn btn--small doccard__copy" onClick={copy}>
        {copied ? t('results.copied') : t('results.copy')}
      </button>
      <JsonNode value={doc} depth={0} />
    </div>
  );
}

export function JsonTree({ docs }: { docs: Doc[] }) {
  return (
    <ol className="jsontree">
      {docs.map((d, i) => (
        <li key={i}>
          <DocCard doc={d} />
        </li>
      ))}
    </ol>
  );
}
