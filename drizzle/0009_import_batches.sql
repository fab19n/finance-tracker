CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`account_id` integer NOT NULL,
	`row_count` integer NOT NULL,
	`opening_before` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch` text;--> statement-breakpoint
CREATE INDEX `tx_import_batch_idx` ON `transactions` (`import_batch`);