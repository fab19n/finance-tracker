ALTER TABLE `transactions` ADD `client_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tx_client_id_idx` ON `transactions` (`client_id`);