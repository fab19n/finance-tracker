/** A piece of text positioned on a PDF page (what a PDF text extractor returns). */
export type TextItem = { str: string; x: number; y: number; width?: number };

/**
 * Rebuild readable lines from positioned text. PDFs store words individually with coordinates, not as lines:
 * items sharing (roughly) the same height form a line, read left to right; lines read top to bottom.
 */
export function itemsToLines(items: TextItem[], yTolerance = 3): string[] {
  const live = items.filter((i) => i.str.trim() !== "");
  // PDF y grows upward, so higher y = higher on the page.
  const sorted = [...live].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - item.y) <= yTolerance) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => {
    const ordered = [...line].sort((a, b) => a.x - b.x);
    let text = "";
    for (let i = 0; i < ordered.length; i++) {
      const cur = ordered[i];
      if (i > 0) {
        const prev = ordered[i - 1];
        const prevEnd = prev.x + (prev.width ?? prev.str.length * 4);
        // Glue fragments that touch (a number split across items); separate words with a space.
        text += cur.x - prevEnd > 1.5 || prev.width === undefined ? " " : "";
      }
      text += cur.str.trim();
    }
    return text.replace(/\s+/g, " ").trim();
  });
}
