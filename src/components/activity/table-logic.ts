export type SortColumn = "date" | "amount";

/**
 * What a sortable column header of the desktop table shows and where it leads. `current` is the `sort` parameter as the page
 * has it ("" is newest first). `next` is the value the header's link writes ("" removes the parameter, i.e. newest first), so
 * a first click sorts the way you would expect and a second click reverses it. Only date and amount sort.
 */
export function sortHeader(current: string, column: SortColumn): { next: string; aria: "ascending" | "descending" | "none"; label: string } {
  if (column === "date") {
    if (current === "oldest") return { next: "", aria: "ascending", label: "Date, oldest first. Sort newest first" };
    if (current === "" || current === "newest") return { next: "oldest", aria: "descending", label: "Date, newest first. Sort oldest first" };
    return { next: "", aria: "none", label: "Sort by date, newest first" };
  }
  if (current === "largest") return { next: "smallest", aria: "descending", label: "Amount, largest first. Sort smallest first" };
  if (current === "smallest") return { next: "largest", aria: "ascending", label: "Amount, smallest first. Sort largest first" };
  return { next: "largest", aria: "none", label: "Sort by amount, largest first" };
}
