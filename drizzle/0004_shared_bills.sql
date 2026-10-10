CREATE TABLE `bill_shares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bill_id` integer NOT NULL,
	`name` text NOT NULL,
	`share` integer NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text,
	`match_keywords` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `recurring_bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `share_id` integer REFERENCES bill_shares(id);