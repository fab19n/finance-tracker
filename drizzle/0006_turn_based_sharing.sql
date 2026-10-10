CREATE TABLE `bill_turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bill_id` integer NOT NULL,
	`month` text NOT NULL,
	`share_id` integer,
	FOREIGN KEY (`bill_id`) REFERENCES `recurring_bills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`share_id`) REFERENCES `bill_shares`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_turn_month_idx` ON `bill_turns` (`bill_id`,`month`);--> statement-breakpoint
ALTER TABLE `recurring_bills` ADD `sharing` text DEFAULT 'monthly' NOT NULL;