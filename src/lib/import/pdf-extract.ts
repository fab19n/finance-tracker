import { getDocumentProxy } from "unpdf";
import { itemsToPositionedLines, type PositionedLine, type TextItem } from "./pdf-lines";

export type PdfErrorCode = "password-required" | "password-wrong" | "unreadable" | "no-text";

export class PdfError extends Error {
  constructor(
    public code: PdfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfError";
  }
}

/** PDF files start with "%PDF". */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/**
 * Read a PDF statement page by page, as positioned lines. Runs entirely on this computer: the file is never sent
 * anywhere, and the password (if the bank protected the file) is used once and not stored.
 */
export async function extractPdfPages(data: Uint8Array, password?: string): Promise<PositionedLine[][]> {
  let doc;
  try {
    // pdf.js takes ownership of the buffer it is given, so hand it a copy.
    doc = await getDocumentProxy(new Uint8Array(data), password ? { password } : undefined);
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    if (err?.name === "PasswordException") {
      // pdf.js: code 1 = a password is needed, code 2 = the one given was wrong.
      throw err.code === 2
        ? new PdfError("password-wrong", "That password didn't open the PDF.")
        : new PdfError("password-required", "This PDF is password-protected.");
    }
    throw new PdfError("unreadable", "That file couldn't be read as a PDF.");
  }

  const pages: PositionedLine[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items) {
      if ("str" in it && it.transform) items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width });
    }
    pages.push(itemsToPositionedLines(items));
  }

  if (!pages.some((p) => p.length)) {
    throw new PdfError("no-text", "This PDF has no readable text - it may be a scanned image. Try pasting the statement text instead.");
  }
  return pages;
}

/** The text of a PDF statement as lines, top to bottom, page after page. */
export async function extractPdfLines(data: Uint8Array, password?: string): Promise<string[]> {
  return (await extractPdfPages(data, password)).flatMap((page) => page.map((l) => l.text));
}
