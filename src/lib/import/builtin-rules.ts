/**
 * Common Malaysian merchants and payees -> a category and a friendly item name. A starting point only:
 * anything you correct during import is remembered (import_rules) and takes priority over these.
 *
 * Patterns run against a lowercased description with punctuation turned into spaces (see normalizeName),
 * so "MCDONALD'S #123" is "mcdonald s 123".
 */
export type BuiltinRule = {
  pattern: RegExp;
  /** Category name as seeded (src/db/seed.ts). */
  category: string;
  item: string;
  /** 'out' = money leaving, 'in' = money arriving. */
  direction: "out" | "in";
  /** Withdrawing cash is moving money to your own cash account, not spending. */
  cash?: boolean;
};

export const BUILTIN_RULES: BuiltinRule[] = [
  // --- money in ---
  { pattern: /\b(salary|gaji|payroll)\b/, category: "Salary", item: "Salary", direction: "in" },
  { pattern: /\b(interest|faedah|dividend|dividen|profit paid)\b/, category: "Investment Income", item: "Interest / dividend", direction: "in" },
  { pattern: /\b(refund|cashback|reversal)\b/, category: "Other Income", item: "Refund", direction: "in" },

  // --- bank charges, then cash ---
  // The bank's own fee (often RM 1 beside an ATM withdrawal): not a purchase, nothing to categorise. It must come BEFORE the
  // cash rule: "ATM WITHDRAWAL FEES (ISSUER)" says ATM too, and a fee is never cash in your hand.
  { pattern: /\b(transaction charge|service charge|bank charge|annual fee|card fee|(?:atm|withdrawal) fees?)\b/, category: "Miscellaneous", item: "Bank charge", direction: "out" },
  // MEPS is the ATM network: "WITHDRAWAL AT MEPS" is how a MAE statement words a cash withdrawal.
  { pattern: /\b(atm|cash withdrawal|cdm withdrawal|withdrawal at meps|tunai)\b/, category: "Miscellaneous", item: "ATM withdrawal", direction: "out", cash: true },

  // --- e-wallet top-ups: spent inside the wallet, which the app doesn't see, so the top-up IS the spending ---
  // (before the ride-hailing rule below, which would otherwise claim "GrabPay"). Touch 'n Go stays under Transport & Fuel.
  { pattern: /\b(gpay network|grabpay|grab pay|shopeepay|shopee pay|bigpay|boost wallet|boost pay)\b/, category: "E-wallet top-up", item: "E-wallet top-up", direction: "out" },

  // --- transport & fuel ---
  { pattern: /\b(petronas|shell|petron|bhp|caltex|setel|esso)\b/, category: "Transport & Fuel", item: "Petrol", direction: "out" },
  // A Touch 'n Go CARD reload is spending: the physical card's balance isn't tracked here (tolls and parking vanish into
  // it). The e-wallet itself can be an account of its own, in which case its history is imported and its top-ups are transfers.
  { pattern: /\b(touch n go|tng|tngd)\b/, category: "Transport & Fuel", item: "Touch 'n Go reload", direction: "out" },
  { pattern: /\b(grabfood|grab food|foodpanda|shopeefood|shopee food|deliveroo)\b/, category: "Eating Out", item: "Food delivery", direction: "out" },
  { pattern: /\b(grab|bolt|maxim|indrive)\b/, category: "Transport & Fuel", item: "Ride-hailing", direction: "out" },
  { pattern: /\b(mrt|lrt|rapid|prasarana|ktm|myrapid)\b/, category: "Transport & Fuel", item: "Public transport", direction: "out" },
  // APSB is the car-park operator behind the "APSB.MY.<MALL>" lines, which show no other word that says parking.
  { pattern: /\b(parking|parkir|car ?park|carpark|apsb|mbpj|mbsj|dbkl|mpsj|mpaj)\b/, category: "Transport & Fuel", item: "Parking", direction: "out" },

  // --- food & groceries ---
  { pattern: /\b(99 speedmart|99speedmart|speedmart)\b/, category: "Groceries", item: "99 Speedmart", direction: "out" },
  { pattern: /\b(giant|aeon big|aeon|jaya grocer|mydin|tesco|lotus|econsave|village grocer|nsk|kk mart|family ?mart|7 ?eleven)\b/, category: "Groceries", item: "Groceries", direction: "out" },
  { pattern: /\b(starbucks|zus|tealive|chatime|gong cha|coffee|dunkin)\b/, category: "Eating Out", item: "Coffee / drinks", direction: "out" },
  { pattern: /\b(mcdonald|mcd|kfc|texas chicken|pizza hut|domino|burger king|subway|nandos|sushi|restoran|restaurant|kopitiam|mamak|food court|kedai makan|secret recipe|old town)\b/, category: "Eating Out", item: "Meal", direction: "out" },
  // DuitNow QR names run words together ("RESTORANMAHBUB", "WARUNGJFD'BUKIT", "CAFE@SUASANA"), so these match as prefixes.
  { pattern: /\b(restoran|restaurant|warung|kopitiam|mamak|bistro|cafe|kafe)\w*|\bfood\b/, category: "Eating Out", item: "Meal", direction: "out" },

  // --- shopping & lifestyle ---
  { pattern: /\b(shopee|lazada|zalora|uniqlo|ikea|mr diy|popular|decathlon|temu|tiktok shop)\b/, category: "Shopping", item: "Online / retail", direction: "out" },
  { pattern: /\b(tgv|gsc|cinema|wayang|steam|playstation)\b/, category: "Entertainment", item: "Entertainment", direction: "out" },
  { pattern: /\b(airasia|malaysia airlines|firefly|agoda|booking com|traveloka|klook)\b/, category: "Travel", item: "Travel", direction: "out" },

  // --- bills, subscriptions, insurance ---
  { pattern: /\b(netflix|spotify|youtube|disney|hbo|apple com bill|icloud|google play|google one|dropbox|adobe|canva|notion|openai|chatgpt|anthropic|claude|microsoft|msft)\b/, category: "Subscriptions", item: "Subscription", direction: "out" },
  { pattern: /\b(tnb|tenaga|syabas|air selangor|indah water|unifi|tm net|tmnet|time dotcom|maxis|celcom|digi|u mobile|umobile|yes 4g|astro)\b/, category: "Bills & Utilities", item: "Utility bill", direction: "out" },
  { pattern: /\b(ptptn|insurance|takaful|prudential|aia|allianz|great eastern|etiqa|assurance|loan|financing|hire purchase)\b/, category: "Loans & Insurance", item: "Loan / insurance", direction: "out" },
  { pattern: /\b(rent|sewa)\b/, category: "Rent / Housing", item: "Rent", direction: "out" },

  // --- health & education ---
  { pattern: /\b(pharmacy|farmasi|guardian|watsons|clinic|klinik|hospital|caring|big pharmacy|dental|pantai|kpj)\b/, category: "Health", item: "Health", direction: "out" },
  { pattern: /\b(udemy|coursera|university|universiti|school|sekolah)\b/, category: "Education", item: "Education", direction: "out" },
];
