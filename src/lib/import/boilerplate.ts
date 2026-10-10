/**
 * Banks wrap every payee in the same words ("IBK FUND TFR FR A/C", "PAYMENT VIA MYDEBIT", "DuitNow QR"). Left in,
 * they make every QR payment look like the same payee: the review screen would group them together, and
 * correcting one would silently rewrite all the others. This strips that wrapper and leaves what identifies the
 * payee. Runs on the ORIGINAL text, so punctuation, "A/C" and "|" separators don't matter.
 */

// Lowercase words; any run of non-alphanumerics matches between them. Add a bank's wording here, one phrase per line.
const PHRASES = [
  // Maybank
  "ibk fund tfr fr a c",
  "ibk fund tfr to a c",
  "fund tfr fr a c",
  "fund tfr to a c",
  "fund transfer to a",
  "fund transfer fr a",
  "transfer from a c",
  "transfer to a c",
  "payment via mydebit",
  "mydebit purchase",
  "sale debit",
  "pre auth debit",
  "pre auth refund",
  "pre auth mydebit",
  "rev preauth mydebit",
  "fpx payment fr a",
  "mbb ct",
  "mae qr",
  // CIMB
  "duitnow to account",
  "duitnow to mobile id",
  "pos debit",
  "i payment",
  "fpxpay",
  "tr ibg",
  "ibg credit",
  "casaoffus",
  // shared
  "duitnow qr",
  "duitnow",
];

const SEP = "[^a-z0-9]+";
// Longest first, so "duitnow to account" goes before "duitnow".
const STRIP = [...PHRASES]
  .sort((a, b) => b.length - a.length)
  .map((p) => new RegExp(`(?<![a-z0-9])${p.split(" ").join(SEP)}(?![a-z0-9])`, "gi"));

/** The description without the bank's own wrapper words. May be empty if there was nothing else. */
export function stripBoilerplate(description: string): string {
  let s = description;
  for (const re of STRIP) s = s.replace(re, " ");
  return s.replace(/[|*]+/g, " ").replace(/\s+/g, " ").trim();
}
