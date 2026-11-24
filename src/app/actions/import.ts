"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommitInput, CommitResult, PreviewResult } from "@/lib/import/api-types";
import { commitRows, MAX_DESCRIPTION_LENGTH, rowShapeProblem } from "@/lib/import/commit";
import type { CsvOverrides } from "@/lib/import/csv";
import { isRealDate } from "@/lib/dates";
import { buildPreview } from "@/lib/import/preview";
import { getSettings } from "@/lib/settings";

const Overrides = z
  .object({
    headerRow: z.number().int().min(-1).optional(),
    date: z.number().int().min(0).nullable().optional(),
    description: z.array(z.number().int().min(0)).optional(),
    debit: z.number().int().min(0).nullable().optional(),
    credit: z.number().int().min(0).nullable().optional(),
    amount: z.number().int().min(0).nullable().optional(),
    balance: z.number().int().min(0).nullable().optional(),
    dateFormat: z.enum(["dmy", "mdy", "ymd"]).optional(),
  })
  .strict();

/**
 * Read an uploaded statement (PDF, CSV, or pasted text) and propose what each line is.
 * Writes nothing: the review screen decides, then commitImport saves.
 */
export async function previewStatement(formData: FormData): Promise<PreviewResult> {
  const accountId = Number(formData.get("accountId"));
  if (!accountId) return { ok: false, error: "Choose which account this statement belongs to." };

  const file = formData.get("file");
  const bytes = file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : undefined;
  const text = typeof formData.get("text") === "string" ? (formData.get("text") as string) : undefined;
  const password = typeof formData.get("password") === "string" && formData.get("password") ? (formData.get("password") as string) : undefined;

  let overrides: CsvOverrides | undefined;
  const rawOverrides = formData.get("overrides");
  if (typeof rawOverrides === "string" && rawOverrides) {
    try {
      overrides = Overrides.parse(JSON.parse(rawOverrides)) as CsvOverrides;
    } catch {
      return { ok: false, error: "The column choices weren't valid." };
    }
  }

  const rawStart = formData.get("startDate");
  const startDate = typeof rawStart === "string" && isRealDate(rawStart) ? rawStart : undefined;

  const [db, settings] = [await getDb(), await getSettings()];
  return buildPreview(db, { accountId, bytes, text: text?.trim() ? text : undefined, password, overrides, expectedIncome: settings.expectedIncome, startDate });
}

const Row = z.object({
  key: z.string().min(1).max(300),
  date: z.string().refine((s) => isRealDate(s)),
  amount: z.number().int(),
  description: z.string().max(400),
  kind: z.enum(["expense", "income", "transfer", "skip"]),
  categoryId: z.number().int().nullable(),
  item: z.string().max(120),
  billId: z.number().int().nullable(),
  shareId: z.number().int().nullable().optional(),
  transferAccountId: z.number().int().nullable(),
  remember: z.boolean(),
});
const Commit = z.object({
  accountId: z.number().int().positive(),
  rows: z.array(Row).max(5000),
  setOpeningBalance: z.number().int().nullable(),
});

/** Save the reviewed rows in one go (all or nothing). */
export async function commitImport(input: CommitInput): Promise<CommitResult> {
  // Say WHICH row is wrong before the generic check fails the lot (an Item longer than the server's limit, say), and
  // trim an over-long bank description: only its first 200 characters are ever stored.
  const rawRows = (input as { rows?: unknown })?.rows;
  if (Array.isArray(rawRows)) {
    const problem = rowShapeProblem(rawRows);
    if (problem) return { ok: false, error: problem };
    input = {
      ...input,
      rows: rawRows.map((r) => (r && typeof r.description === "string" && r.description.length > MAX_DESCRIPTION_LENGTH ? { ...r, description: r.description.slice(0, MAX_DESCRIPTION_LENGTH) } : r)),
    } as CommitInput;
  }
  const parsed = Commit.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The import data wasn't valid. Re-read the statement and try again." };
  const result = commitRows(await getDb(), parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
