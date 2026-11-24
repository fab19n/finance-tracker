/** What deleting a bill takes with it, counted from the books, and the words the confirmation sheet uses. Pure. */
export type BillUsage = {
  /** Recorded payments linked to the bill (kept as ordinary spending). */
  payments: number;
  /** People sharing the bill (deleted, with what they owe). */
  people: number;
  /** Planned turns in a rotation (deleted). */
  turns: number;
  /** Learned import rules that file statement lines under the bill (deleted). */
  rules: number;
};

export const NO_USAGE: BillUsage = { payments: 0, people: 0, turns: 0, rules: 0 };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The things that are deleted along with the bill, e.g. ["3 people sharing it, with what each owes", "2 learned import rules"]. */
export function goesWithBill(u: BillUsage): string[] {
  const goes: string[] = [];
  if (u.people > 0) goes.push(`${plural(u.people, "person", "people")} sharing it, with what ${u.people === 1 ? "they owe" : "each owes"}`);
  if (u.turns > 0) goes.push(`${plural(u.turns, "planned turn")} in the rotation`);
  if (u.rules > 0) goes.push(`${plural(u.rules, "learned import rule")}`);
  return goes;
}

/** The sentence under "Delete {bill}?": what goes, what stays, and the safer Pause. */
export function deleteBillBody(u: BillUsage): string {
  const goes = goesWithBill(u);
  const parts: string[] = [];
  parts.push(goes.length ? `This also deletes ${goes.join(", ")}.` : "Nothing else is attached to it: no one shares it and no import rule points at it.");
  const kept = u.payments > 0 ? `${plural(u.payments, "payment")} you recorded for it` : "Payments you recorded for it";
  parts.push(
    u.people > 0
      ? `${kept} stay as entries in your books, and so does money your people sent, but it is no longer counted towards anyone.`
      : `${kept} stay as entries in your books, just no longer linked to the bill.`,
  );
  parts.push("This can't be undone.");
  parts.push(
    "To keep the history instead, cancel and untick Active in the form above, then Save: a paused bill stops being tracked as due but keeps its people, turns and rules.",
  );
  return parts.join(" ");
}
