"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommitInput, CommitResult, PreviewResult } from "@/lib/import/api-types";
import { commitRows } from "@/lib/import/commit";
import type { CsvOverrides } from "@/lib/import/csv";
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

  const [db, settings] = [await getDb(), await getSettings()];
  return buildPreview(db, { accountId, bytes, text: text?.trim() ? text : undefined, password, overrides, expectedIncome: settings.expectedIncome });
}

const Row = z.object({
  key: z.string().min(1).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int(),
  description: z.string().max(400),
  kind: z.enum(["expense", "income", "transfer", "skip"]),
  categoryId: z.number().int().nullable(),
  item: z.string().max(120),
  billId: z.number().int().nullable(),
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
  const parsed = Commit.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The import data wasn't valid. Re-read the statement and try again." };
  const result = commitRows(await getDb(), parsed.data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
