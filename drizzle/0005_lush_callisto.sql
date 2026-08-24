CREATE TABLE `provider_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_profiles_module_provider_unique` ON `provider_profiles` (`module`,`provider`);--> statement-breakpoint
CREATE TABLE `provider_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`is_secret` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_settings_profile_key_unique` ON `provider_settings` (`profile_id`,`key`);