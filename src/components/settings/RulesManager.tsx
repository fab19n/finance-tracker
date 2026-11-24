import { CheckCircle2 } from "lucide-react";
import { deleteImportRule, updateImportRule } from "@/app/actions/import";
import { getDb } from "@/db/client";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { SubmitButton } from "@/components/SubmitButton";
import { describeRule, listLearnedRules } from "@/lib/import/rules";
import { listCategories } from "@/lib/queries/reference";

const NOTICE = { saved: "Rule saved.", deleted: "Rule forgotten. Entries already imported are unchanged." } as const;

/**
 * Settings > Appearance & data: the rules the importer learned from your corrections, so a wrong one can be changed or
 * forgotten. Nothing at all until it has learned something.
 */
export async function RulesManager({ notice }: { notice?: string }) {
  const [rules, categories] = await Promise.all([listLearnedRules(await getDb()), listCategories(false)]);
  const message = notice === "saved" || notice === "deleted" ? NOTICE[notice] : null;
  if (rules.length === 0 && !message) return null;
  return (
    <section className="card space-y-3" aria-labelledby="rules-h">
      <div>
        <h2 id="rules-h" className="h2">
          Learned rules
        </h2>
        <p className="sub mt-1 leading-relaxed">
          When you correct a line while importing, the app remembers the payee and sorts it the same way next time. If it learned something wrong, change or forget it here. Entries you already imported are never changed.
        </p>
      </div>
      {message && (
        <p role="status" className="banner banner-good">
          <CheckCircle2 aria-hidden />
          <span className="min-w-0">{message}</span>
        </p>
      )}
      <ul className="space-y-2">
        {rules.map((r) => {
          const choices = categories.filter((c) => c.type === r.kind);
          return (
            <li key={r.id} className="space-y-2 rounded-2xl bg-card-subtle p-3.5">
              <div className="min-w-0">
                <p className="break-words text-[13px] font-black">{r.pattern}</p>
                <p className="sub !text-[11px]">
                  {describeRule(r)} · {r.matched === 0 ? "no imported entries yet" : `${r.matched} imported ${r.matched === 1 ? "entry" : "entries"}`}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {r.kind !== "transfer" && (
                  <ActionForm action={updateImportRule} className="flex min-w-0 flex-1 basis-56 items-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="min-w-0 flex-1">
                      <label className="label" htmlFor={`rule-${r.id}-cat`}>
                        Category
                      </label>
                      <select id={`rule-${r.id}-cat`} name="categoryId" defaultValue={r.categoryId ?? ""} className="input" required>
                        {r.categoryId === null && <option value="">Choose a category…</option>}
                        {choices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <SubmitButton className="btn shrink-0" pendingLabel="Saving...">
                      Save
                    </SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={deleteImportRule} className="shrink-0">
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmSubmit
                    trigger="Forget"
                    triggerLabel={`Forget the rule for ${r.pattern}`}
                    triggerClassName="btn"
                    title={`Forget the rule for “${r.pattern}”?`}
                    body={`${describeRule(r)}. The next statement with this payee is sorted without it, and asks you again if it can't tell. Entries already imported stay as they are.${r.kind === "transfer" ? " This rule also helps the importer recognise transfers between your own accounts: without it, the next import may file such a line as spending or miss its mirror on the other account." : ""}`}
                    confirmLabel="Forget this rule"
                    cancelLabel="Keep it"
                  />
                </ActionForm>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
