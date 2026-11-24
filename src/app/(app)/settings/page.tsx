import { Download, FileText, ListOrdered } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  saveAccount,
  saveAssumptions,
  saveCycleSettings,
  saveCategory,
  toggleAccountArchived,
  toggleCategoryArchived,
} from "@/app/actions/settings";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { RecentImports } from "@/components/import/RecentImports";
import { ThisPhoneCard } from "@/components/offline/ThisPhoneCard";
import { BACK_TO_MORE, PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { SwipeTabs } from "@/components/SwipeTabs";
import { TabLinks } from "@/components/SectionTabs";
import { AppearanceCard } from "@/components/settings/AppearanceCard";
import { CategoryFields } from "@/components/settings/CategoryFields";
import { ColorField } from "@/components/settings/ColorField";
import { SavedNotice } from "@/components/settings/SavedNotice";
import { pinEnabled } from "@/lib/auth";
import { initials } from "@/lib/initials";
import { formatRM, senToInput } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import type { SearchParams } from "@/lib/queries/filters";
import { listCategories, type CategoryWithUsage } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";
import { parseSettingsTab, settingsHref, SETTINGS_TABS } from "@/lib/settings-tabs";

export const metadata: Metadata = { title: "Settings" };

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
  const f = `cat-${c?.id ?? "new"}`;
  return (
    <ActionForm action={saveCategory} className="grid grid-cols-2 gap-2.5 md:grid-cols-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="col-span-2 min-w-0">
        <label className="label" htmlFor={`${f}-name`}>
          Name
        </label>
        <input id={`${f}-name`} name="name" defaultValue={c?.name} placeholder="e.g. Groceries" required className="input" />
      </div>
      <CategoryFields idPrefix={f} type={c?.type} nature={c?.nature} budget={c?.monthlyBudget ? senToInput(c.monthlyBudget) : ""} />
      <ColorField defaultValue={c?.color} />
      <SubmitButton pendingLabel="Saving..." className="btn-primary col-span-2 md:col-span-6">
        {c ? "Save" : "Add category"}
      </SubmitButton>
    </ActionForm>
  );
}

/** One heading + intro per tab, so each tab reads on its own. */
function Intro({ children }: { children: React.ReactNode }) {
  return <div className="sub space-y-1.5 px-1 leading-relaxed">{children}</div>;
}

/** Edit one account, or (without `a`) add a new one. Every field has a visible label. */
function AccountForm({ a }: { a?: Account }) {
  const f = `acct-${a?.id ?? "new"}`;
  return (
    <ActionForm action={saveAccount} className={`grid grid-cols-2 gap-2.5 md:grid-cols-5 ${a ? "" : "card"}`}>
      {a ? <input type="hidden" name="id" value={a.id} /> : <h2 className="h2 col-span-2 md:col-span-5">Add account</h2>}
      <div className="min-w-0">
        <label className="label" htmlFor={`${f}-name`}>
          Name
        </label>
        <input id={`${f}-name`} name="name" defaultValue={a?.name} placeholder="e.g. Maybank Savings" required className="input" />
      </div>
      <div className="min-w-0">
        <label className="label" htmlFor={`${f}-type`}>
          Type
        </label>
        <select id={`${f}-type`} name="type" defaultValue={a?.type ?? "bank"} className="input">
          {ACCOUNT_TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label className="label" htmlFor={`${f}-opening`}>
          Opening balance (RM)
        </label>
        <input
          id={`${f}-opening`}
          name="openingBalance"
          defaultValue={a ? senToInput(a.openingBalance) : ""}
          placeholder="0.00"
          inputMode="decimal"
          className="input"
        />
      </div>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <label className="label" htmlFor={`${f}-role`}>
          Role
        </label>
        <select id={`${f}-role`} name="purpose" defaultValue={a?.purpose ?? ""} className="input">
          {ACCOUNT_ROLES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] font-bold leading-snug text-muted">Each role belongs to one account: choosing it here takes it from the account that has it now.</p>
      </div>
      <SubmitButton pendingLabel="Saving..." className="btn-primary col-span-2 self-end md:col-span-1">
        {a ? "Save" : "Add account"}
      </SubmitButton>
    </ActionForm>
  );
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
                  <Link href={`/transactions?account=${a.id}`} className="btn w-full md:w-auto">
                    <ListOrdered size={14} strokeWidth={2.5} aria-hidden /> See this account&apos;s entries
                  </Link>
                  <Link href={`/accounts/${a.id}/card`} className="btn w-full md:ml-2 md:w-auto">
                    Card, colour and Main account
                  </Link>
                  <AccountForm a={a} />
                  <ActionForm action={toggleAccountArchived}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="archived" value={a.archived ? "0" : "1"} />
                    {a.archived ? (
                      <SubmitButton className="btn" pendingLabel="Restoring...">Restore account</SubmitButton>
                    ) : (
                      <ConfirmSubmit
                        trigger="Archive account"
                        triggerClassName="btn-danger min-h-11"
                        title={`Archive ${a.name}?`}
                        body={
                          a.purpose
                            ? `It stops showing in the pickers. Its entries and balance stay, and you can restore it any time. It is your ${a.purpose === "spending" ? "Spending" : "Savings"} account: archiving it releases that role, and the Plan will ask you to choose another account.`
                            : "It stops showing in the pickers. Its entries and balance stay, and you can restore it any time."
                        }
                        confirmLabel="Archive"
                        tone="neutral"
                      />
                    )}
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
      <AccountForm />
    </div>
  );
}

function CategoriesTab({ categories }: { categories: CategoryWithUsage[] }) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Intro>
        <p>
          Tag each expense as a <strong className="text-foreground">need</strong> or <strong className="text-foreground">want</strong> - Home compares your split with
          the 50/30/20 guideline. Add a monthly budget to an expense category to be warned when you overspend (income categories have none).
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
                        <ActionForm action={toggleCategoryArchived}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
                          {c.archived ? (
                            <SubmitButton className="btn" pendingLabel="Restoring...">Restore category</SubmitButton>
                          ) : (
                            <ConfirmSubmit
                              trigger="Archive category"
                              triggerClassName="btn-danger min-h-11"
                              title={`Archive ${c.name}?`}
                              body="It stops showing when you add an entry. Entries already in it stay, and you can restore it any time."
                              confirmLabel="Archive"
                              tone="neutral"
                            />
                          )}
                        </ActionForm>
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
      <ActionForm action={saveCycleSettings} className="card grid grid-cols-2 gap-3 md:grid-cols-3">
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
        <SubmitButton className="btn-primary self-end" pendingLabel="Saving...">Save</SubmitButton>
      </ActionForm>
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
      <ActionForm action={saveAssumptions} className="card grid grid-cols-2 gap-3 md:grid-cols-3">
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
        <SubmitButton className="btn-primary self-end" pendingLabel="Saving...">Save assumptions</SubmitButton>
      </ActionForm>
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

      <RecentImports />

      <ThisPhoneCard pinOn={locked} />

      <section className="card space-y-2.5" aria-labelledby="pin-h">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pin-h" className="h2">
            PIN lock: {locked ? "on" : "off"}
          </h2>
          <span className={`pill ${locked ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{locked ? "On" : "Off"}</span>
        </div>
        {locked ? (
          <>
            <p className="sub leading-relaxed">PIN is on. Anyone who opens this address (on your Wi-Fi, or over Tailscale from a device on your tailnet) must enter the PIN to see your data.</p>
            <p className="sub leading-relaxed">&ldquo;Lock now&rdquo; (in the card above) signs this device out and clears what this phone has saved.</p>
            <p className="sub leading-relaxed">
              To change the PIN, edit the <code className={CODE}>.env.local</code> file and restart the app.
            </p>
          </>
        ) : (
          <p className="sub leading-relaxed">
            Anyone who can open this address (on your Wi-Fi, or a device on your Tailscale network) can see your data. To require a PIN, add a line like <code className={CODE}>APP_PIN=482915</code> to a file named{" "}
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
    <SwipeTabs hrefs={SETTINGS_TABS.map((t) => settingsHref(t.id))} current={SETTINGS_TABS.findIndex((t) => t.id === tab)}>
    <div className="max-w-3xl space-y-3 md:space-y-4">
      <PageHeader title="Settings" subtitle="Accounts, categories, appearance" back={BACK_TO_MORE} />

      <TabLinks variant="chips" label="Settings" tabs={SETTINGS_TABS.map((t) => ({ href: settingsHref(t.id), label: t.label, current: t.id === tab }))} />

      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}
      <SavedNotice saved={sp.saved} note={sp.note} />

      {tab === "accounts" && <AccountsTab accounts={accounts} />}
      {tab === "categories" && <CategoriesTab categories={categories} />}
      {tab === "payday" && <PaydayTab settings={settings} />}
      {tab === "investing" && <InvestingTab settings={settings} />}
      {tab === "data" && <DataTab />}
    </div>
    </SwipeTabs>
  );
}
