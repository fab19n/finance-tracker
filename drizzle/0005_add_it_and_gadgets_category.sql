-- A default category that was missing (see src/db/seed.ts):
--   "IT & Gadgets" (expense): phones, computers, parts and accessories. Large, occasional purchases that are not
--                             everyday shopping, so they don't swamp the "Shopping" picture.
--
-- Only for a database that ALREADY has categories. A brand-new database is empty at this point (migrations run before
-- the seeder), and inserting here would make the seeder think the defaults are present and skip all of them; it adds
-- this one itself. Safe to run on a database that already has a category of the same name: it adds nothing.
INSERT INTO categories (name, type, nature, color, icon, is_system, archived, sort_order)
SELECT 'IT & Gadgets', 'expense', 'want', '#6366f1', '💻', 0, 0, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories)
WHERE EXISTS (SELECT 1 FROM categories)
  AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'IT & Gadgets');
