-- A default category (see src/db/seed.ts):
--   "TnG card top up" (expense): money put on the physical Touch 'n Go card FROM the Touch 'n Go e-wallet. The wallet
--                                history import files its "Card Reload" lines here (src/lib/import/builtin-rules.ts).
--                                A "need" like Transport & Fuel, where those lines used to go: the card pays tolls and parking.
--
-- Only for a database that ALREADY has categories. A brand-new database is empty at this point (migrations run before
-- the seeder), and inserting here would make the seeder think the defaults are present and skip all of them; it adds
-- this one itself. Safe to run on a database that already has a category of the same name: it adds nothing.
INSERT INTO categories (name, type, nature, color, icon, is_system, archived, sort_order)
SELECT 'TnG card top up', 'expense', 'need', '#b45309', '💳', 0, 0, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories)
WHERE EXISTS (SELECT 1 FROM categories)
  AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'TnG card top up');
