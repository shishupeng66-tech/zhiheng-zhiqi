CREATE TABLE `voice_clones` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`custom_speaker_id` text NOT NULL,
	`display_name` text NOT NULL,
	`language` text DEFAULT 'cn' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`error_message` text,
	`reference_text` text,
	`sample_path` text NOT NULL,
	`sample_format` text NOT NULL,
	`sample_size_bytes` integer NOT NULL,
	`demo_audio_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_clones_custom_speaker_id_unique` ON `voice_clones` (`custom_speaker_id`);--> statement-breakpoint
CREATE INDEX `voice_clones_owner_idx` ON `voice_clones` (`owner_id`);--> statement-breakpoint
CREATE INDEX `voice_clones_workspace_idx` ON `voice_clones` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `voice_clones_speaker_idx` ON `voice_clones` (`custom_speaker_id`);--> statement-breakpoint
CREATE INDEX `voice_clones_status_idx` ON `voice_clones` (`status`);