CREATE TABLE `import_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern` text NOT NULL,
	`kind` text NOT NULL,
	`category_id` integer,
	`item` text,
	`bill_id` integer,
	`transfer_account_id` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `recurring_bills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_rule_pattern_idx` ON `import_rules` (`pattern`);--> statement-breakpoint
CREATE TABLE `recurring_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer,
	`account_id` integer NOT NULL,
	`amount_min` integer NOT NULL,
	`amount_max` integer NOT NULL,
	`due_day` integer,
	`match_keywords` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `purpose` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `bill_id` integer REFERENCES recurring_bills(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_key` text;--> statement-breakpoint
CREATE INDEX `tx_import_key_idx` ON `transactions` (`account_id`,`import_key`);