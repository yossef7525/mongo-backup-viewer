import { useMemo } from 'react';
import { describeValue, isBranch } from './value';
import { Value, type Doc } from './Value';

const titleOf = (v: unknown) => (isBranch(describeValue(v)) ? JSON.stringify(v).slice(0, 500) : describeValue(v).text);

export function ResultsTable({ docs }: { docs: Doc[] }) {
  const columns = useMemo(() => {
    const seen = new Set<string>();
    if (docs.some((d) => '_id' in d)) seen.add('_id');
    for (const d of docs) for (const k of Object.keys(d)) seen.add(k);
    return [...seen];
  }, [docs]);
  return (
    <div className="table-wrap">
      <table className="results">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" dir="auto">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((d, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} title={c in d ? titleOf(d[c]) : undefined}>
                  {c in d ? <Value v={d[c]} /> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
