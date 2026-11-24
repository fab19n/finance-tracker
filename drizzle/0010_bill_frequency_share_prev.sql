ALTER TABLE `recurring_bills` ADD `frequency` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `recurring_bills` ADD `due_month` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `share_prev_item` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `share_prev_category_id` integer;