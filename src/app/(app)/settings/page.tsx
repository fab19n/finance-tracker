import { ChevronRight, Download, FileText, Info, ListOrdered, Plus, Upload } from "lucide-react";
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
import { DuoIcon } from "@/components/DuoIcon";
import { Money } from "@/components/Money";
import { RecentImports } from "@/components/import/RecentImports";
import { ThisPhoneCard } from "@/components/offline/ThisPhoneCard";
import { BACK_TO_MORE, PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { SwipeTabs } from "@/components/SwipeTabs";
import { TabLinks } from "@/components/SectionTabs";
import { AppearanceCard } from "@/components/settings/AppearanceCard";
import { CategoryFields } from "@/components/settings/CategoryFields";
import { ColorField } from "@/components/settings/ColorField";
import { RestoreSwitch } from "@/components/settings/RestoreSwitch";
import { RulesManager } from "@/components/settings/RulesManager";
import { SavedNotice } from "@/components/settings/SavedNotice";
import { pinEnabled } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { formatRM, formatRMWhole, senToInput } from "@/lib/money";
import { getAccountBalances } from "@/lib/queries/accounts";
import type { SearchParams } from "@/lib/queries/filters";
import { getPlan } from "@/lib/queries/plan";
import { listCategories, type CategoryWithUsage } from "@/lib/queries/reference";
import { getSettings } from "@/lib/settings";
import { parseSettingsTab, settingsHref, SETTINGS_TABS } from "@/lib/settings-tabs";
import { dailyLeftOutIds } from "@/lib/analytics/daily-spend";

export const metadata: Metadata = { title: "Settings" };

type Account = Awaited<ReturnType<typeof getAccountBalances>>[number];
type AppSettings = Awaited<ReturnType<typeof getSettings>>;

const ACCOUNT_ROLES = [
  ["", "No special role"],
  ["spending", "Main account: salary lands here, bills paid from it"],
  ["savings", "Savings: emergency fund / money set aside"],
] as const;

const ACCOUNT_TYPES = [
  ["bank", "Bank"],
  ["cash", "Cash in hand"],
  ["ewallet", "e-Wallet"],
  ["investment", "Investment"],
] as const;

function CategoryForm({ c, kind }: { c?: CategoryWithUsage; kind?: "expense" | "income" }) {
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
      <CategoryFields idPrefix={f} type={c?.type ?? kind} nature={c?.nature} budget={c?.monthlyBudget ? senToInput(c.monthlyBudget) : ""} />
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
    <ActionForm action={saveAccount} className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
      {a && <input type="hidden" name="id" value={a.id} />}
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

const ROLE_TAG = { spending: { label: "Main", tone: "tag-info" }, savings: { label: "Savings", tone: "tag-good" } } as const;
const ACCOUNT_ICON = { bank: "bank", cash: "cash", ewallet: "ewallet", investment: "invest" } as const;

function AccountsTab({ accounts }: { accounts: Account[] }) {
  return (
    <div className="space-y-3 md:space-y-4">
      <Intro>
        <p>
          Set each account&apos;s <strong className="text-foreground">opening balance</strong> to what it held the day you start tracking. Balances
          are then calculated from your entries.
        </p>
        <p>
          Give two accounts a <strong className="text-foreground">role</strong>: <em>Main</em> (where salary lands and bills are paid) and{" "}
          <em>Savings</em>. That lets the Plan page tell a top-up from savings apart from real spending.
        </p>
      </Intro>
      <section aria-labelledby="accounts-h" className="space-y-2">
        <h2 id="accounts-h" className="h2 px-1">
          Accounts
        </h2>
        {/* One card, one row per account: the disc, name and kind, its role as a tag, its balance. Open a row to change it. */}
        <ul className="rows">
          {accounts.map((a) => {
            const role = a.purpose ? ROLE_TAG[a.purpose] : null;
            return (
              <li key={a.id} className={a.archived ? "opacity-70" : ""}>
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                    <span className="disc">
                      <DuoIcon name={ACCOUNT_ICON[a.type]} size={22} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="truncate text-[13.5px] font-extrabold">{a.name}</span>
                        {role && <span className={`pill ${role.tone}`}>{role.label}</span>}
                        {a.archived && <span className="pill tag-warn">Archived</span>}
                      </span>
                      <span className="sub block truncate">{ACCOUNT_TYPES.find(([t]) => t === a.type)?.[1]}</span>
                    </span>
                    <Money sen={a.balance} className="num shrink-0 text-[13px] font-black" />
                    <ChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-muted transition group-open:rotate-90" aria-hidden />
                  </summary>
                  <div className="space-y-3 pb-3.5">
                    <div className="flex flex-col gap-2 md:flex-row">
                      <Link href={`/transactions?account=${a.id}`} className="btn w-full md:w-auto">
                        <ListOrdered size={14} strokeWidth={2.5} aria-hidden /> See this account&apos;s entries
                      </Link>
                      <Link href={`/accounts/${a.id}/card`} className="btn w-full md:w-auto">
                        Card, colour and Main account
                      </Link>
                    </div>
                    <AccountForm a={a} />
                    {a.archived ? (
                      <RestoreSwitch action={toggleAccountArchived} id={a.id} what={a.name} />
                    ) : (
                      <ActionForm action={toggleAccountArchived}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="archived" value="1" />
                        <ConfirmSubmit
                          trigger="Archive account"
                          triggerClassName="btn-danger min-h-11"
                          title={`Archive ${a.name}?`}
                          body={
                            a.purpose
                              ? `It stops showing in the pickers. Its entries and balance stay, and you can restore it any time. It is your ${a.purpose === "spending" ? "Main" : "Savings"} account: archiving it releases that role, and the Plan will ask you to choose another account.`
                              : "It stops showing in the pickers. Its entries and balance stay, and you can restore it any time."
                          }
                          confirmLabel="Archive"
                          tone="neutral"
                        />
                      </ActionForm>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
      <details className="group rounded-3xl border-[1.5px] border-dashed border-line open:border-transparent open:bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 p-3 text-[13px] font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">
          <Plus size={14} strokeWidth={3} className="transition group-open:rotate-45" aria-hidden /> Add an account
        </summary>
        <div className="px-[18px] pb-[18px]">
          <AccountForm />
        </div>
      </details>
    </div>
  );
}

/** A budget as the board prints it: whole ringgit when it is one ("RM 1,100"), else with the sen. */
const budgetText = (sen: number) => (sen % 100 === 0 ? formatRMWhole(sen) : formatRM(sen));

function CategoriesTab({ categories, kind }: { categories: CategoryWithUsage[]; kind: "expense" | "income" }) {
  const shown = categories.filter((c) => c.type === kind).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="space-y-3 md:space-y-4">
      <Intro>
        <p>
          Tag each expense as a <strong className="text-foreground">need</strong> or <strong className="text-foreground">want</strong> - Home compares your split with
          the 50/30/20 guideline. Add a monthly budget to an expense category to be warned when you overspend (income categories have none).
        </p>
      </Intro>
      {/* Expense or Income: two links (tabs are links), the current one marked. */}
      <nav aria-label="Kind of category" className="seg">
        {(["expense", "income"] as const).map((k) => (
          <Link key={k} href={`/settings?tab=categories${k === "income" ? "&kind=income" : ""}`} className="seg-item" aria-current={k === kind ? "page" : undefined}>
            {k === "expense" ? "Expense" : "Income"}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="cats-h" className="space-y-2">
        <h2 id="cats-h" className="h2 px-1">
          {kind === "expense" ? "Expense categories" : "Income categories"}
        </h2>
        {shown.length === 0 ? (
          <p className="sub px-1">None yet.</p>
        ) : (
          <ul className="rows">
            {shown.map((c) => (
              <li key={c.id} className={c.archived ? "opacity-70" : ""}>
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                    {/* The category's own colour is user data: a 26 (15%) tint behind letters in the text colour. */}
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl text-xs font-black text-foreground" style={{ backgroundColor: `${c.color}26` }} aria-hidden>
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-extrabold">{c.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {kind === "expense" && <span className={`pill ${c.nature === "need" ? "tag-info" : "tag-warn"}`}>{c.nature === "need" ? "Need" : "Want"}</span>}
                        {c.archived && <span className="pill tag-warn">Archived</span>}
                      </span>
                    </span>
                    {kind === "expense" && <span className="num shrink-0 text-[13px] font-black">{c.monthlyBudget ? budgetText(c.monthlyBudget) : <span className="font-bold text-muted">None</span>}</span>}
                    <ChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-muted transition group-open:rotate-90" aria-hidden />
                  </summary>
                  <div className="space-y-3 pb-3.5">
                    <CategoryForm c={c} />
                    {!c.isSystem &&
                      (c.archived ? (
                        <RestoreSwitch action={toggleCategoryArchived} id={c.id} what={c.name} />
                      ) : (
                        <ActionForm action={toggleCategoryArchived}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="archived" value="1" />
                          <ConfirmSubmit
                            trigger="Archive category"
                            triggerClassName="btn-danger min-h-11"
                            title={`Archive ${c.name}?`}
                            body="It stops showing when you add an entry. Entries already in it stay, and you can restore it any time."
                            confirmLabel="Archive"
                            tone="neutral"
                          />
                        </ActionForm>
                      ))}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
      <details className="group rounded-3xl border-[1.5px] border-dashed border-line open:border-transparent open:bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 p-3 text-[13px] font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">
          <Plus size={14} strokeWidth={3} className="transition group-open:rotate-45" aria-hidden /> Add a category
        </summary>
        <div className="px-[18px] pb-[18px]">
          <CategoryForm kind={kind} />
        </div>
      </details>
    </div>
  );
}

/** A read-only line of the Payday card: what it is, where it is set, the value. A link when the value lives on another page. */
function InfoRow({ title, caption, href, children }: { title: string; caption: string; href?: string; children: React.ReactNode }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold">{title}</span>
        <span className="sub block">{caption}</span>
      </span>
      <span className="shrink-0 text-[13px] font-extrabold">{children}</span>
      {href && <ChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-muted" aria-hidden />}
    </>
  );
  return href ? (
    <Link href={href} className="flex min-h-14 items-center gap-3 py-2 transition hover:bg-card-subtle">
      {body}
    </Link>
  ) : (
    <div className="flex min-h-14 items-center gap-3 py-2">{body}</div>
  );
}

/** The categories the daily limit skips. Closed, it still names what is ticked, so the list can be checked at a glance. */
function DailyLeftOut({ categories, leftOut, countedNeeds }: { categories: CategoryWithUsage[]; leftOut: readonly number[]; countedNeeds: readonly number[] }) {
  const ticked = dailyLeftOutIds(categories, leftOut, countedNeeds);
  // Archived ones appear only while they matter: left out, or a Need you chose to count.
  const choices = categories.filter((c) => c.type === "expense" && (!c.archived || ticked.includes(c.id) || countedNeeds.includes(c.id)));
  const names = choices.filter((c) => ticked.includes(c.id)).map((c) => c.name);
  return (
    <details className="group mt-1">
      <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center py-1 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-accent-strong">
          Categories that don&apos;t count ({names.length})
          <ChevronRight size={14} strokeWidth={2.5} className="transition group-open:rotate-90" aria-hidden />
        </span>
        <span className="sub">{names.length > 0 ? names.join(", ") : "None ticked: only bill payments are left out."}</span>
      </summary>
      <fieldset>
        <legend className="sr-only">Categories the daily limit doesn&apos;t count</legend>
        {/* Says the list was on the form: with nothing ticked, the checkboxes themselves send nothing. */}
        <input type="hidden" name="dailyLeftOutList" value="1" />
        <ul className="grid grid-cols-2 gap-x-3 md:grid-cols-3">
          {choices.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 py-1 text-[13px] font-bold">
                <input type="checkbox" name="dailyLeftOut" value={c.id} defaultChecked={ticked.includes(c.id)} className="size-5 shrink-0 accent-accent-strong" />
                <span className="min-w-0">
                  {c.name}
                  {c.nature === "need" && <span className="block text-[11px] font-semibold text-muted">Need</span>}
                </span>
              </label>
              {/* Tells the save which boxes were on screen: an unticked Need is remembered, one never shown is not. */}
              <input type="hidden" name="dailyShown" value={c.id} />
            </li>
          ))}
        </ul>
      </fieldset>
    </details>
  );
}

async function PaydayTab({ settings, accounts, categories }: { settings: AppSettings; accounts: Account[]; categories: CategoryWithUsage[] }) {
  const plan = await getPlan(todayISO());
  const main = accounts.find((a) => a.purpose === "spending" && !a.archived);
  const savings = accounts.find((a) => a.purpose === "savings" && !a.archived);
  const usual = plan.planner.usualTransfer;
  return (
    <div className="space-y-3 md:space-y-4">
      <Intro>
        <p>
          Your month runs payday to payday. These settings drive the <strong className="text-foreground">Plan</strong> page: how much to keep for
          everyday things, and what to move to savings. The daily limit drives the daily spending card on{" "}
          <strong className="text-foreground">Home</strong>.
        </p>
      </Intro>
      {/* A new key whenever a stored setting changes, so every box starts again from what was stored. After a save the new
          values only arrive as defaults, which boxes already on screen ignore: they went on showing the old ones, and the
          next Save wrote those back. */}
      <ActionForm key={JSON.stringify(settings)} action={saveCycleSettings} className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Payday, day of the month</span>
            <input name="paydayDay" type="number" min={1} max={31} defaultValue={settings.paydayDay} className="input" />
          </label>
          <label>
            <span className="label">Expected salary (RM)</span>
            <input name="expectedIncome" inputMode="decimal" defaultValue={settings.expectedIncome ? senToInput(settings.expectedIncome) : ""} placeholder="e.g. 5400" className="input" />
          </label>
        </div>
        {/* Home's "Set a daily limit" and "Change limit" links land here. */}
        <div id="daily-limit" className="scroll-mt-4">
          <label>
            <span className="label">Daily spending limit (RM)</span>
            <input
              name="dailyLimit"
              inputMode="decimal"
              defaultValue={settings.dailyLimit ? senToInput(settings.dailyLimit) : ""}
              placeholder="e.g. 50"
              className="input"
              aria-describedby="daily-limit-help"
            />
          </label>
          <p id="daily-limit-help" className="sub mt-1.5">
            Home colours each day against it, past periods too. Bill payments never count, nor do the categories ticked below. Needs
            are ticked for you, new ones too: untick one to count it. Leave the limit blank to turn the colours off.
          </p>
          <DailyLeftOut categories={categories} leftOut={settings.dailyLeftOutCategories} countedNeeds={settings.dailyCountedNeeds} />
        </div>
        {/* The two roles are set on the account itself (its Card settings), so here they are read-only rows that go there. */}
        <div className="rows">
          <InfoRow title="Main account" caption="Set on the account itself" href={main ? `/accounts/${main.id}/card` : "/settings"}>
            {main ? main.name : <span className="text-warn">Not chosen</span>}
          </InfoRow>
          <InfoRow title="Savings account" caption="Set on the account itself" href={savings ? `/accounts/${savings.id}/card` : "/settings"}>
            {savings ? savings.name : <span className="text-muted">None</span>}
          </InfoRow>
          <InfoRow title="Usual move to savings" caption={usual === null ? "Learned from what you move after each payday" : "What you usually move after payday"}>
            {usual === null ? <span className="text-muted">Not enough paydays yet</span> : <Money sen={usual} />}
          </InfoRow>
        </div>
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-extrabold text-accent-strong [&::-webkit-details-marker]:hidden">
            Advanced
            <ChevronRight size={14} strokeWidth={2.5} className="transition group-open:rotate-90" aria-hidden />
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
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
          </div>
        </details>
        <p className="banner banner-info">
          <Info aria-hidden />
          <span className="min-w-0">
            The next payday is predicted from the median day of your recent salaries; the day above is only used until you have recorded one. Leave the allowance blank and the app suggests one from what you spend.
          </span>
        </p>
        <SubmitButton className="btn-primary w-full" pendingLabel="Saving...">
          Save
        </SubmitButton>
      </ActionForm>
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
          <span className="label">Fixed deposit rate (% p.a.)</span>
          <input name="fdRatePct" type="number" step="0.01" defaultValue={settings.fdRatePct} className="input" />
        </label>
        <label>
          <span className="label">Assumed return a year: S&amp;P 500 (%)</span>
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
        <p className="banner banner-info col-span-2 md:col-span-3">
          <Info aria-hidden />
          <span className="min-w-0">Price refresh uses two public sources (Yahoo Finance and frankfurter.dev). If either fails, the Invest page says so and you type the value by hand.</span>
        </p>
        <SubmitButton className="btn-primary col-span-2 w-full md:col-span-3" pendingLabel="Saving...">
          Save assumptions
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

const CODE = "rounded-md bg-card-subtle px-1.5 py-0.5 text-xs font-bold text-foreground";

/** A line of the Data card: a title with its caption, and the button that does it. */
function DataRow({ title, caption, children }: { title: string; caption: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold">{title}</span>
        <span className="sub block leading-snug">{caption}</span>
      </span>
      {children}
    </div>
  );
}

function DataTab({ ruleNotice }: { ruleNotice?: string }) {
  const locked = pinEnabled();
  return (
    <div className="space-y-3 md:space-y-4">
      <AppearanceCard />

      <section className="space-y-2" aria-labelledby="data-h">
        <h2 id="data-h" className="h2 px-1">
          Your data
        </h2>
        <div className="rows">
          <DataRow
            title="PIN lock"
            caption={
              locked ? (
                <>
                  Asked again after 30 days. To change the PIN, edit <code className={CODE}>.env.local</code> and restart the app. &ldquo;Lock now&rdquo; is in the card below.
                </>
              ) : (
                <>
                  Off: anyone who can open this address can see your data. To require a PIN add a line like <code className={CODE}>APP_PIN=482915</code> to <code className={CODE}>.env.local</code> and restart the app.
                </>
              )
            }
          >
            <span className={`pill ${locked ? "tag-good" : "tag-warn"}`}>{locked ? "On" : "Off"}</span>
          </DataRow>
          <DataRow
            title="Back up"
            caption={
              <>
                koopang-backup-{todayISO()}.db, the whole database. It lives in <code className={CODE}>{process.env.DB_PATH ?? "data/finance.db"}</code>; nothing is sent to the cloud.
              </>
            }
          >
            <a href="/settings/backup" className="btn" download>
              <Download size={14} strokeWidth={2.5} aria-hidden /> Download
            </a>
          </DataRow>
          <DataRow title="Export entries" caption="Every transaction as a CSV (Activity can export what it shows)">
            <a href="/transactions/export?month=all" className="btn" download>
              <FileText size={14} strokeWidth={2.5} aria-hidden /> CSV
            </a>
          </DataRow>
          <DataRow title="Import a statement" caption="PDF or CSV from a bank">
            <Link href="/import" className="btn">
              <Upload size={14} strokeWidth={2.5} aria-hidden /> Import
            </Link>
          </DataRow>
        </div>
      </section>

      <RecentImports />

      <RulesManager notice={ruleNotice} />

      <ThisPhoneCard pinOn={locked} />
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = parseSettingsTab(sp.tab);
  const kind = (Array.isArray(sp.kind) ? sp.kind[0] : sp.kind) === "income" ? "income" : "expense";
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const [accounts, categories, settings] = await Promise.all([
    getAccountBalances(true),
    listCategories(true),
    getSettings(),
  ]);

  return (
    <SwipeTabs hrefs={SETTINGS_TABS.map((t) => settingsHref(t.id))} current={SETTINGS_TABS.findIndex((t) => t.id === tab)}>
    <div className="max-w-3xl space-y-3 md:space-y-4">
      <PageHeader title="Settings" back={BACK_TO_MORE} />

      <TabLinks variant="chips" label="Settings" tabs={SETTINGS_TABS.map((t) => ({ href: settingsHref(t.id), label: t.label, current: t.id === tab }))} />

      {error && (
        <p role="alert" className="banner banner-danger">
          {error}
        </p>
      )}
      <SavedNotice saved={sp.saved} note={sp.note} />

      {tab === "accounts" && <AccountsTab accounts={accounts} />}
      {tab === "categories" && <CategoriesTab categories={categories} kind={kind} />}
      {tab === "payday" && <PaydayTab settings={settings} accounts={accounts} categories={categories} />}
      {tab === "investing" && <InvestingTab settings={settings} />}
      {tab === "data" && <DataTab ruleNotice={Array.isArray(sp.rule) ? sp.rule[0] : sp.rule} />}
    </div>
    </SwipeTabs>
  );
}
