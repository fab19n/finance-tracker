CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`nature` text DEFAULT 'want' NOT NULL,
	`color` text DEFAULT '#64748b' NOT NULL,
	`icon` text DEFAULT '•' NOT NULL,
	`monthly_budget` integer,
	`is_system` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`product` text NOT NULL,
	`ticker` text,
	`units` real,
	`principal` integer,
	`annual_rate_pct` real,
	`start_date` text,
	`maturity_date` text,
	`compounding` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`account_id` integer NOT NULL,
	`to_account_id` integer,
	`category_id` integer,
	`item` text,
	`merchant` text,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tx_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `tx_category_date_idx` ON `transactions` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `tx_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `tx_item_idx` ON `transactions` (`item`);--> statement-breakpoint
CREATE TABLE `valuations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `valuation_account_date_idx` ON `valuations` (`account_id`,`date`);