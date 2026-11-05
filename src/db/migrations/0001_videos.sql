CREATE TABLE `clips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` integer NOT NULL,
	`title` text NOT NULL,
	`hook` text NOT NULL,
	`reason` text,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`status` text DEFAULT 'proposto' NOT NULL,
	`output_file` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clips_video_idx` ON `clips` (`video_id`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`source_url` text,
	`file_name` text,
	`duration_ms` integer,
	`language` text DEFAULT 'pt' NOT NULL,
	`guidance` text,
	`status` text DEFAULT 'na_fila' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer
);
