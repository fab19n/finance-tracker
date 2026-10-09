/**
 * Builds a minimal but real PDF in memory, with text at exact coordinates - enough to exercise the
 * actual PDF text extraction without shipping a (private) bank statement as a fixture.
 */
export type PdfWord = { text: string; x: number; y: number };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function makePdf(pages: PdfWord[][]): Uint8Array {
  // Object numbers: 1 = catalog, 2 = page tree, then a (page, content) pair per page, then the font.
  const fontNo = 3 + pages.length * 2;
  const objects: string[] = [];
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((words, i) => {
    const stream = words.map((w) => `BT /F1 10 Tf 1 0 0 1 ${w.x} ${w.y} Tm (${esc(w.text)}) Tj ET`).join("\n");
    objects[2 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontNo} 0 R >> >> >>`;
    objects[3 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontNo - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** Lay out statement rows as a table: one cell per column at fixed x positions, one line per row, top to bottom. */
export function tablePage(rows: string[][], columnX: number[], startY = 740, lineHeight = 14): PdfWord[] {
  const words: PdfWord[] = [];
  rows.forEach((cells, r) => {
    cells.forEach((text, c) => {
      if (text) words.push({ text, x: columnX[c], y: startY - r * lineHeight });
    });
  });
  return words;
}
