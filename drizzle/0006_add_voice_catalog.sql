CREATE TABLE `voice_catalog` (
	`voice_type` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`gender` text,
	`language` text,
	`dialects` text DEFAULT '[]' NOT NULL,
	`scene` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`description` text,
	`resource_id` text DEFAULT 'seed-tts-2.0' NOT NULL,
	`voice_kind` text DEFAULT 'preset' NOT NULL,
	`provider` text DEFAULT 'doubao' NOT NULL,
	`preview_url` text,
	`enabled_for_production` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `voice_catalog_enabled_idx` ON `voice_catalog` (`enabled_for_production`);--> statement-breakpoint
CREATE INDEX `voice_catalog_resource_idx` ON `voice_catalog` (`resource_id`);