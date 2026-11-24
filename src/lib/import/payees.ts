/**
 * The "By payee" view of an import review: lines grouped by their payee (`group`, from `rulePattern`) so ONE decision applies
 * to every line of it. Pure, so the grouping is tested without a browser.
 */

export type PayeeLine = {
  key: string;
  group: string;
  description: string;
  amount: number;
  kind: "expense" | "income" | "transfer" | "skip";
  categoryId: number | null;
  transferAccountId: number | null;
  item: string;
  proposal: { source: string };
  /** A line the user repaired by leaving it out or adding it: never part of a payee decision. */
  fix?: { type: string } | null;
};

/** Money in and money out from the same payee are different decisions (a refund is not a purchase). */
export function payeeKey(r: Pick<PayeeLine, "group" | "amount">): string {
  return `${r.group}|${r.amount < 0 ? "out" : "in"}`;
}

/** A payee decision reaches every line except those already settled by the app: duplicates, held-and-released lines and repairs. */
export function takesPayeeDecision(r: Pick<PayeeLine, "proposal" | "fix">): boolean {
  return r.proposal.source !== "duplicate" && r.proposal.source !== "hold" && !r.fix;
}

export type PayeeGroup<T extends PayeeLine> = {
  key: string;
  label: string;
  rows: T[];
  /** The lines a decision would change (some of the group may be duplicates, which stay skipped). */
  editable: T[];
  /** Net sen of the lines shown (positive = money in). */
  total: number;
  /** What the editable lines share: the value, or "mixed" when they differ, or null when there is nothing to share. */
  kind: PayeeLine["kind"] | "mixed" | null;
  categoryId: number | null | "mixed";
  transferAccountId: number | null | "mixed";
  item: string | "mixed";
};

function common<T, V>(items: T[], pick: (t: T) => V): V | "mixed" | undefined {
  if (!items.length) return undefined;
  const first = pick(items[0]);
  return items.every((i) => pick(i) === first) ? first : "mixed";
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Readable payee name: the rule pattern in capitals ("restoran mahbub" -> "Restoran Mahbub"), or the line itself for one with no payee. */
export function payeeLabel(r: Pick<PayeeLine, "group" | "description">): string {
  return r.group.startsWith("line-") ? r.description : titleCase(r.group);
}

/** Group lines by payee, keeping the order in which each payee first appears. */
export function groupByPayee<T extends PayeeLine>(rows: readonly T[]): PayeeGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = payeeKey(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()].map(([key, list]) => {
    const editable = list.filter(takesPayeeDecision);
    return {
      key,
      label: payeeLabel(list[0]),
      rows: list,
      editable,
      total: list.reduce((s, r) => s + r.amount, 0),
      kind: (common(editable, (r) => r.kind) ?? null) as PayeeGroup<T>["kind"],
      categoryId: (common(editable, (r) => r.categoryId) ?? null) as PayeeGroup<T>["categoryId"],
      transferAccountId: (common(editable, (r) => r.transferAccountId) ?? null) as PayeeGroup<T>["transferAccountId"],
      item: (common(editable, (r) => r.item) ?? "") as PayeeGroup<T>["item"],
    };
  });
}
