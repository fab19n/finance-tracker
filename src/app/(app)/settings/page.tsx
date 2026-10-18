import { Download, FileText } from "lucide-react";
import {
  saveAccount,
  saveAssumptions,
  saveCycleSettings,
  saveCategory,
  toggleAccountArchived,
  toggleCategoryArchived,
} from "@/app/actions/settings";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { LockNowForm } from "@/components/offline/LockNowForm";
import { PageHeader } from "@/components/PageHeader";
import { TabLinks } from "@/components/SectionTabs";
import { AppearanceCard } from "@/components/settings/AppearanceCard";
import { ColorField } from "@/components/settings/ColorField";
import { pinEnabled } from "@/lib/auth";
import { initials } from "@/lib/initials";
import { formatRM, senToInput } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import type { SearchParams } from "@/lib/queries/filters";
import { listCategories, type CategoryWithUsage } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";
import { parseSettingsTab, settingsHref, SETTINGS_TABS } from "@/lib/settings-tabs";

type Account = Awaited<ReturnType<typeof getAccountBalances>>[number];
type AppSettings = Awaited<ReturnType<typeof getSettings>>;

const ACCOUNT_ROLES = [
  ["", "No special role"],
  ["spending", "Spending: salary lands here, bills paid from it"],
  ["savings", "Savings: emergency fund / money set aside"],
] as const;

const ACCOUNT_TYPES = [
  ["bank", "Bank"],
  ["cash", "Cash in hand"],
  ["ewallet", "e-Wallet"],
  ["investment", "Investment"],
] as const;

function CategoryForm({ c }: { c?: CategoryWithUsage }) {
  return (
    <form action={saveCategory} className="grid grid-cols-2 gap-2.5 md:grid-cols-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input name="name" defaultValue={c?.name} placeholder="Name" required className="input col-span-2" aria-label="Name" />
      <select name="type" defaultValue={c?.type ?? "expense"} className="input" aria-label="Type">
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>
      <select name="nature" defaultValue={c?.nature ?? "want"} className="input" aria-label="Need or want">
        <option value="need">Need</option>
        <option value="want">Want</option>
        <option value="saving">Saving / Income</option>
      </select>
      <input
        name="monthlyBudget"
        defaultValue={c?.monthlyBudget ? senToInput(c.monthlyBudget) : ""}
        placeholder="Monthly budget (RM)"
        inputMode="decimal"
        className="input col-span-2 md:col-span-6"
        aria-label="Monthly budget"
      />
      <ColorField defaultValue={c?.color} />
      <button className="btn-primary col-span-2 md:col-span-6">{c ? "Save" : "Add category"}</button>
    </form>
  );
}

/** One heading + intro per tab, so each tab reads on its own. */
function Intro({ children }: { children: React.ReactNode }) {
  return <div className="sub space-y-1.5 px-1 leading-relaxed">{children}</div>;
}

function AccountsTab({ accounts }: { accounts: Account[] }) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Intro>
        <p>
          Set each account&apos;s <strong className="text-foreground">opening balance</strong> to what it held the day you start tracking. Balances
          are then calculated from your entries.
        </p>
        <p>
          Give two accounts a <strong className="text-foreground">role</strong>: <em>Spending</em> (where salary lands and bills are paid) and{" "}
          <em>Savings</em>. That lets the Plan page tell a top-up from savings apart from real spending.
        </p>
      </Intro>
      <section className="card" aria-labelledby="accounts-h">
        <h2 id="accounts-h" className="h2 mb-3">
          Accounts
        </h2>
        <ul className="space-y-1.5">
          {accounts.map((a) => (
            <li key={a.id} className={`rounded-2xl bg-card-subtle px-3 py-2.5 ${a.archived ? "opacity-60" : ""}`}>
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-xl bg-card text-xs font-black" aria-hidden>
                    {initials(a.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-extrabold">{a.name}</span>
                    <span className="block truncate text-[11px] font-bold text-muted">{ACCOUNT_TYPES.find(([t]) => t === a.type)?.[1]}</span>
                  </span>
                  {a.purpose && <span className="pill bg-accent-soft text-accent-strong">{a.purpose === "spending" ? "Spending" : "Savings"}</span>}
                  {a.archived && <span className="pill bg-warn-soft text-warn">Archived</span>}
                  <span className="num shrink-0 text-[13px] font-black">{formatRM(a.balance)}</span>
                </summary>
                <div className="mt-3 space-y-2">
                  <form action={saveAccount} className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="name" defaultValue={a.name} required className="input" aria-label="Name" />
                    <select name="type" defaultValue={a.type} className="input" aria-label="Type">
                      {ACCOUNT_TYPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input name="openingBalance" defaultValue={senToInput(a.openingBalance)} inputMode="decimal" className="input" aria-label="Opening balance" />
                    <select name="purpose" defaultValue={a.purpose ?? ""} className="input col-span-2 md:col-span-1" aria-label="Role">
                      {ACCOUNT_ROLES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <button className="btn-primary col-span-2 md:col-span-1">Save</button>
                  </form>
                  <form action={toggleAccountArchived}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="archived" value={a.archived ? "0" : "1"} />
                    {a.archived ? (
                      <button className="btn-danger">Restore account</button>
                    ) : (
                      <ConfirmSubmit
                        trigger="Archive account"
                        triggerClassName="btn-danger"
                        title={`Archive ${a.name}?`}
                        body="It stops showing in the pickers. Its entries and balance stay, and you can restore it any time."
                        confirmLabel="Archive"
                        tone="neutral"
                      />
                    )}
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
      <form action={saveAccount} className="card grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <h2 className="h2 col-span-2 md:col-span-5">Add account</h2>
        <input name="name" placeholder="New account name" required className="input" aria-label="Name" />
        <select name="type" defaultValue="bank" className="input" aria-label="Type">
          {ACCOUNT_TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input name="openingBalance" placeholder="Opening RM" inputMode="decimal" className="input" aria-label="Opening balance" />
        <select name="purpose" defaultValue="" className="input col-span-2 md:col-span-1" aria-label="Role">
          {ACCOUNT_ROLES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="btn-primary col-span-2 md:col-span-1">Add account</button>
      </form>
    </div>
  );
}

function CategoriesTab({ categories }: { categories: CategoryWithUsage[] }) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Intro>
        <p>
          Tag each expense as a <strong className="text-foreground">need</strong> or <strong className="text-foreground">want</strong> - the dashboard compares your split with
          the 50/30/20 guideline. Add a monthly budget to be warned when you overspend.
        </p>
      </Intro>
      {(["expense", "income"] as const).map((kind) => (
        <section key={kind} className="card" aria-label={kind === "expense" ? "Expense categories" : "Income categories"}>
          <h2 className="h2 mb-3">{kind === "expense" ? "Expense categories" : "Income categories"}</h2>
          <ul className="space-y-1.5">
            {categories
              .filter((c) => c.type === kind)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((c) => (
                <li key={c.id} className={`rounded-2xl bg-card-subtle px-3 py-2.5 ${c.archived ? "opacity-60" : ""}`}>
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
                      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold">{c.name}</span>
                      {kind === "expense" && (
                        <span className={`pill ${c.nature === "need" ? "bg-nav-active text-foreground" : "bg-warn-soft text-warn"}`}>{c.nature === "need" ? "Need" : "Want"}</span>
                      )}
                      {c.archived && <span className="pill bg-warn-soft text-warn">Archived</span>}
                      <span className="num shrink-0 text-[11px] font-bold text-muted">{c.monthlyBudget ? `${formatRM(c.monthlyBudget)}/mo` : "no budget"}</span>
                    </summary>
                    <div className="mt-3 space-y-2">
                      <CategoryForm c={c} />
                      {!c.isSystem && (
                        <form action={toggleCategoryArchived}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
                          {c.archived ? (
                            <button className="btn-danger">Restore category</button>
                          ) : (
                            <ConfirmSubmit
                              trigger="Archive category"
                              triggerClassName="btn-danger"
                              title={`Archive ${c.name}?`}
                              body="It stops showing when you add an entry. Entries already in it stay, and you can restore it any time."
                              confirmLabel="Archive"
                              tone="neutral"
                            />
                          )}
                        </form>
                      )}
                    </div>
                  </details>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <div className="card space-y-3">
        <h2 className="h2">Add a category</h2>
        <CategoryForm />
      </div>
    </div>
  );
}

function PaydayTab({ settings }: { settings: AppSettings }) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Intro>
        <p>
          Your month runs payday to payday. These settings drive the <strong className="text-foreground">Plan</strong> page: how much to keep for
          everyday things, and what to move to savings.
        </p>
      </Intro>
      <form action={saveCycleSettings} className="card grid grid-cols-2 gap-3 md:grid-cols-3">
        <label>
          <span className="label">Usual payday (day of month)</span>
          <input name="paydayDay" type="number" min={1} max={31} defaultValue={settings.paydayDay} className="input" />
        </label>
        <label>
          <span className="label">Take-home pay (RM)</span>
          <input name="expectedIncome" inputMode="decimal" defaultValue={settings.expectedIncome ? senToInput(settings.expectedIncome) : ""} placeholder="e.g. 5400" className="input" />
        </label>
        <label>
          <span className="label">Everyday allowance (RM)</span>
          <input name="variableAllowance" inputMode="decimal" defaultValue={settings.variableAllowance ? senToInput(settings.variableAllowance) : ""} placeholder="groceries, fuel, food..." className="input" />
        </label>
        <label>
          <span className="label">Buffer (RM)</span>
          <input name="cycleBuffer" inputMode="decimal" defaultValue={senToInput(settings.cycleBuffer)} className="input" />
        </label>
        <label>
          <span className="label">Savings account pays (% p.a.)</span>
          <input name="savingsRatePct" type="number" step="0.01" min={0} max={15} defaultValue={settings.savingsRatePct} className="input" />
        </label>
        <button className="btn-primary self-end">Save</button>
      </form>
      <p className="sub px-1 leading-relaxed">
        Leave the allowance blank and the app suggests one from what you actually spend. The payday day is only used until you&apos;ve recorded a salary; after that it learns your
        real payday.
      </p>
    </div>
  );
}

function InvestingTab({ settings }: { settings: AppSettings }) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Intro>
        <p>
          Used by the Invest page for projections. These are <strong className="text-foreground">illustrative defaults, not promises</strong> - check your bank&apos;s current
          fixed-deposit rate and adjust.
        </p>
      </Intro>
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
        <button className="btn-primary self-end">Save assumptions</button>
      </form>
    </div>
  );
}

const CODE = "rounded-md bg-card-subtle px-1.5 py-0.5 text-xs font-bold text-foreground";

function DataTab() {
  const locked = pinEnabled();
  return (
    <div className="space-y-3 md:space-y-4">
      <AppearanceCard />

      <section className="card space-y-3" aria-labelledby="data-h">
        <h2 id="data-h" className="h2">
          Everything is stored on this computer
        </h2>
        <p className="sub leading-relaxed">
          In <code className={CODE}>{process.env.DB_PATH ?? "data/finance.db"}</code> - nothing is sent to the cloud. Back it up now and then (or run{" "}
          <code className={CODE}>pnpm run backup</code>).
        </p>
        <div className="flex flex-col gap-2 md:flex-row">
          <a href="/settings/backup" className="btn flex-1" download>
            <Download size={14} strokeWidth={2.5} aria-hidden /> Download full backup (.db)
          </a>
          <a href="/transactions/export?month=all" className="btn flex-1" download>
            <FileText size={14} strokeWidth={2.5} aria-hidden /> Export every transaction (CSV)
          </a>
        </div>
      </section>

      <section className="card space-y-2.5" aria-labelledby="pin-h">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pin-h" className="h2">
            PIN lock: {locked ? "on" : "off"}
          </h2>
          <span className={`pill ${locked ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{locked ? "On" : "Off"}</span>
        </div>
        {locked ? (
          <>
            <p className="sub leading-relaxed">PIN is on. Anyone on your Wi-Fi must enter the PIN to see your data.</p>
            <LockNowForm />
            <p className="sub leading-relaxed">Signs this device out and clears the pages saved on it. Entries not yet sent stay on the phone.</p>
            <p className="sub leading-relaxed">
              To change the PIN, edit the <code className={CODE}>.env.local</code> file and restart the app.
            </p>
          </>
        ) : (
          <p className="sub leading-relaxed">
            Anyone on your Wi-Fi who opens this address can see your data. To require a PIN, add a line like <code className={CODE}>APP_PIN=482915</code> to a file named{" "}
            <code className={CODE}>.env.local</code> in the project folder and restart the app.
          </p>
        )}
      </section>
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = parseSettingsTab(sp.tab);
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const [accounts, categories, settings] = await Promise.all([
    getAccountBalances(true),
    listCategories(true),
    getSettings(),
  ]);

  return (
    <div className="max-w-3xl space-y-3 md:space-y-4">
      <PageHeader title="Settings" subtitle="Accounts, categories, appearance" />

      <TabLinks variant="chips" label="Settings" tabs={SETTINGS_TABS.map((t) => ({ href: settingsHref(t.id), label: t.label, current: t.id === tab }))} />

      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}

      {tab === "accounts" && <AccountsTab accounts={accounts} />}
      {tab === "categories" && <CategoriesTab categories={categories} />}
      {tab === "payday" && <PaydayTab settings={settings} />}
      {tab === "investing" && <InvestingTab settings={settings} />}
      {tab === "data" && <DataTab />}
    </div>
  );
}
