/** Two letters for a tile: the first letters of the first two words ("Eating Out" -> "EO"), else the first two letters. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "•";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}
