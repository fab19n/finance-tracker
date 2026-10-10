-- Two categories that were missing from the defaults (see src/db/seed.ts):
--   "E-wallet top-up"  (expense): reloading GrabPay / ShopeePay / Boost from the bank. The money is spent inside the wallet,
--                                 which this app doesn't see, so the top-up is the spending (as Touch 'n Go reloads are).
--   "Reimbursements"   (income):  friends and family paying you back (a shared Netflix, a dinner they owed), which is
--                                 money in but not earnings or a gift.
--
-- Only for a database that ALREADY has categories. A brand-new database is empty at this point (migrations run before
-- the seeder), and inserting here would make the seeder think the defaults are present and skip all of them; it adds
-- these two itself. Safe to run on a database that already has a category of the same name: it adds nothing.
INSERT INTO categories (name, type, nature, color, icon, is_system, archived, sort_order)
SELECT 'E-wallet top-up', 'expense', 'want', '#0ea5e9', '👛', 0, 0, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories)
WHERE EXISTS (SELECT 1 FROM categories)
  AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'E-wallet top-up');
--> statement-breakpoint
INSERT INTO categories (name, type, nature, color, icon, is_system, archived, sort_order)
SELECT 'Reimbursements', 'income', 'saving', '#4ade80', '🤝', 0, 0, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories)
WHERE EXISTS (SELECT 1 FROM categories)
  AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Reimbursements');
