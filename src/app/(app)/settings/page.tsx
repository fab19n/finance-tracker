import { logout } from "@/app/actions/auth";
import {
  saveAccount,
  saveAssumptions,
  saveCategory,
  toggleAccountArchived,
  toggleCategoryArchived,
} from "@/app/actions/settings";
import { pinEnabled } from "@/lib/auth";
import { formatRM, senToInput } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import type { SearchParams } from "@/lib/queries/filters";
import { listCategories, type CategoryWithUsage } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";

const ACCOUNT_TYPES = [
  ["bank", "Bank"],
  ["cash", "Cash in hand"],
  ["ewallet", "e-Wallet"],
  ["investment", "Investment"],
] as const;

function CategoryForm({ c }: { c?: CategoryWithUsage }) {
  return (
    <form action={saveCategory} className="grid grid-cols-2 gap-2 md:grid-cols-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input name="name" defaultValue={c?.name} placeholder="Name" required className="input col-span-2" />
      <select name="type" defaultValue={c?.type ?? "expense"} className="input" aria-label="Type">
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>
      <select name="nature" defaultValue={c?.nature ?? "want"} className="input" aria-label="Need or want">
        <option value="need">Need</option>
        <option value="want">Want</option>
        <option value="saving">Saving/Income</option>
      </select>
      <input name="icon" defaultValue={c?.icon ?? ""} placeholder="Emoji" maxLength={4} className="input" />
      <input
        name="monthlyBudget"
        defaultValue={c?.monthlyBudget ? senToInput(c.monthlyBudget) : ""}
        placeholder="Monthly budget RM"
        inputMode="decimal"
        className="input"
      />
      <input type="color" name="color" defaultValue={c?.color ?? "#64748b"} className="h-11 w-full rounded-xl border border-line bg-background p-1" aria-label="Colour" />
      <button className="btn-primary !py-2.5 text-sm md:col-span-2">{c ? "Save" : "Add category"}</button>
    </form>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const [accounts, categories, settings] = await Promise.all([
    getAccountBalances(true),
    listCategories(true),
    getSettings(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="h-page">Settings</h1>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Accounts</h2>
        <p className="text-sm text-muted">
          Set each account&apos;s <strong>opening balance</strong> to what it held the day you start tracking. Balances
          are then calculated from your entries.
        </p>
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className={`card !p-3 ${a.archived ? "opacity-60" : ""}`}>
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="font-medium">
                    {a.name}{" "}
                    <span className="pill bg-background text-muted">
                      {ACCOUNT_TYPES.find(([t]) => t === a.type)?.[1]}
                    </span>
                    {a.archived && <span className="pill ml-1 bg-warn-soft text-warn">archived</span>}
                  </span>
                  <span className="num font-semibold">{formatRM(a.balance)}</span>
                </summary>
                <div className="mt-3 space-y-2">
                  <form action={saveAccount} className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="name" defaultValue={a.name} required className="input" aria-label="Name" />
                    <select name="type" defaultValue={a.type} className="input" aria-label="Type">
                      {ACCOUNT_TYPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input
                      name="openingBalance"
                      defaultValue={senToInput(a.openingBalance)}
                      inputMode="decimal"
                      className="input"
                      aria-label="Opening balance"
                    />
                    <button className="btn-primary !py-2.5 text-sm">Save</button>
                  </form>
                  <form action={toggleAccountArchived}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="archived" value={a.archived ? "0" : "1"} />
                    <button className="btn-danger">{a.archived ? "Restore account" : "Archive account"}</button>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <form action={saveAccount} className="card grid grid-cols-2 gap-2 md:grid-cols-4">
          <input name="name" placeholder="New account name" required className="input" />
          <select name="type" defaultValue="bank" className="input" aria-label="Type">
            {ACCOUNT_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input name="openingBalance" placeholder="Opening RM" inputMode="decimal" className="input" />
          <button className="btn-primary !py-2.5 text-sm">Add account</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Categories</h2>
        <p className="text-sm text-muted">
          Tag each expense as a <strong>need</strong> or <strong>want</strong> - the dashboard compares your split with
          the 50/30/20 guideline. Add a monthly budget to be warned when you overspend.
        </p>
        {(["expense", "income"] as const).map((kind) => (
          <div key={kind} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {kind === "expense" ? "Expense categories" : "Income categories"}
            </h3>
            <ul className="space-y-2">
              {categories
                .filter((c) => c.type === kind)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((c) => (
                  <li key={c.id} className={`card !p-3 ${c.archived ? "opacity-60" : ""}`}>
                    <details>
                      <summary className="flex cursor-pointer items-center justify-between gap-3">
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            className="grid size-8 place-items-center rounded-full"
                            style={{ backgroundColor: `${c.color}22` }}
                          >
                            {c.icon}
                          </span>
                          {c.name}
                          {kind === "expense" && (
                            <span
                              className={`pill ${c.nature === "need" ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}
                            >
                              {c.nature}
                            </span>
                          )}
                          {c.archived && <span className="pill bg-warn-soft text-warn">archived</span>}
                        </span>
                        <span className="num text-sm text-muted">
                          {c.monthlyBudget ? `${formatRM(c.monthlyBudget)}/mo` : ""}
                        </span>
                      </summary>
                      <div className="mt-3 space-y-2">
                        <CategoryForm c={c} />
                        {!c.isSystem && (
                          <form action={toggleCategoryArchived}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
                            <button className="btn-danger">{c.archived ? "Restore category" : "Archive category"}</button>
                          </form>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
            </ul>
          </div>
        ))}
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold">Add a category</h3>
          <CategoryForm />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Investing assumptions</h2>
        <p className="text-sm text-muted">
          Used by the Invest page for projections. These are <strong>illustrative defaults, not promises</strong> - check
          your bank&apos;s current fixed-deposit rate and adjust.
        </p>
        <form action={saveAssumptions} className="card grid grid-cols-2 gap-3 md:grid-cols-3">
          <label>
            <span className="label">FD rate (% p.a.)</span>
            <input name="fdRatePct" type="number" step="0.01" defaultValue={settings.fdRatePct} className="input" />
          </label>
          <label>
            <span className="label">S&amp;P 500 return (% p.a.)</span>
            <input name="sp500ReturnPct" type="number" step="0.1" defaultValue={settings.sp500ReturnPct} className="input" />
          </label>
          <label>
            <span className="label">Emergency fund (months)</span>
            <input name="emergencyMonths" type="number" step="1" defaultValue={settings.emergencyMonths} className="input" />
          </label>
          <label>
            <span className="label">Investing horizon (years)</span>
            <input name="horizonYears" type="number" step="1" defaultValue={settings.horizonYears} className="input" />
          </label>
          <label>
            <span className="label">Risk profile</span>
            <select name="riskProfile" defaultValue={settings.riskProfile} className="input">
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="growth">Growth</option>
            </select>
          </label>
          <button className="btn-primary !py-2.5 text-sm self-end">Save assumptions</button>
        </form>
      </section>

      <section className="space-y-3" aria-labelledby="data-h">
        <h2 id="data-h" className="text-lg font-semibold">
          Your data &amp; security
        </h2>
        <div className="card space-y-4 text-sm">
          <div>
            <p className="font-medium">Everything is stored on this computer</p>
            <p className="text-muted">
              In <code className="rounded bg-background px-1">{process.env.DB_PATH ?? "data/finance.db"}</code> - nothing is sent to the cloud.
              Back it up now and then (or run <code className="rounded bg-background px-1">pnpm run backup</code>).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href="/settings/backup" className="btn" download>
                Download full backup (.db)
              </a>
              <a href="/transactions/export?month=all" className="btn" download>
                Export every transaction (CSV)
              </a>
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <p className="font-medium">PIN lock: {pinEnabled() ? "on" : "off"}</p>
            {pinEnabled() ? (
              <form action={logout} className="mt-2">
                <button className="btn">Lock now</button>
              </form>
            ) : (
              <p className="text-muted">
                Anyone on your Wi-Fi who opens this address can see your data. To require a PIN, add a line like{" "}
                <code className="rounded bg-background px-1">APP_PIN=482915</code> to a file named{" "}
                <code className="rounded bg-background px-1">.env.local</code> in the project folder and restart the app.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
