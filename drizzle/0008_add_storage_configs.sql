CREATE TABLE `storage_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`storage_path` text NOT NULL,
	`storage_type` text DEFAULT 'local' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_configs_key_unique` ON `storage_configs` (`storage_key`);