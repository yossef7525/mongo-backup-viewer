import { useMemo } from 'react';
import { describeValue, isBranch } from './value';
import { Value, type Doc } from './Value';
import { PopoverCell } from './ValuePopover';


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
              <th key={c} scope="col">
                <bdi>{c}</bdi>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((d, i) => (
            <tr key={i}>
              {columns.map((c) => {
                if (!Object.hasOwn(d, c)) return <td key={c} />;
                const v = d[c];
                const view = describeValue(v);
                // Non-empty arrays and objects open a JSON tree popover; scalars keep the native tooltip for long text.
                return isBranch(view) && Object.keys(v as object).length > 0 ? (
                  <PopoverCell key={c} value={v}>
                    <Value v={v} />
                  </PopoverCell>
                ) : (
                  <td key={c} title={view.text}>
                    <Value v={v} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
