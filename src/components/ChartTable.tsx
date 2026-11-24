import { ChevronRight } from "lucide-react";

/** Table-view twin of a chart: every value reachable without hover or colour. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="group mt-2 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-xs font-extrabold text-muted hover:text-foreground">
        <ChevronRight size={14} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
        View as table
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-2xl bg-card-subtle">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-card-subtle">
            <tr>
              {columns.map((c, i) => (
                <th key={c} scope="col" className={`px-3 py-2 font-extrabold text-muted ${i > 0 ? "text-right" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => (
                  <td key={ci} className={`num px-3 py-1.5 font-bold ${ci > 0 ? "text-right" : ""}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
