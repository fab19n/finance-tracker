import { getDb } from "@/db/client";
import { dayLabel } from "@/lib/dates";
import { listRecentImports } from "@/lib/import/undo";
import { UndoImport } from "./UndoImport";

/** Settings > Appearance & data: the last few imports, each with an undo. Nothing at all until something has been imported. */
export async function RecentImports() {
  const recent = listRecentImports(await getDb(), 5);
  if (recent.length === 0) return null;
  return (
    <section className="card space-y-3" aria-labelledby="recent-imports-h">
      <div>
        <h2 id="recent-imports-h" className="h2">
          Recent imports
        </h2>
        <p className="sub mt-1 leading-relaxed">Imported a statement into the wrong account? Undo it here and import it again.</p>
      </div>
      <ul className="space-y-2">
        {recent.map((r) => (
          <li key={r.id} className="space-y-2 rounded-2xl bg-card-subtle p-3.5">
            <p className="text-[13px] font-black">
              {r.accountName} · {r.count} {r.count === 1 ? "entry" : "entries"}
            </p>
            <p className="sub !text-[11px]">
              {dayLabel(r.createdAt.slice(0, 10))}
              {r.setOpening ? " · set the starting balance" : ""}
            </p>
            <UndoImport batchId={r.id} count={r.count} accountName={r.accountName} transfers={r.transfers} />
          </li>
        ))}
      </ul>
    </section>
  );
}
