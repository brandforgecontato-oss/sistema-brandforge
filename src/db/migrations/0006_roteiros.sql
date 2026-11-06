CREATE TABLE `scripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic` text NOT NULL,
	`trend_id` integer,
	`guidance` text,
	`status` text DEFAULT 'gerando' NOT NULL,
	`title` text,
	`hook_text` text,
	`beats` text,
	`cta` text,
	`caption` text,
	`hashtags` text,
	`estimated_sec` integer,
	`video_id` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`trend_id`) REFERENCES `trend_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scripts_status_idx` ON `scripts` (`status`);--> statement-breakpoint
ALTER TABLE `videos` ADD `script_id` integer;