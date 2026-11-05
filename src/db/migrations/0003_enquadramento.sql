ALTER TABLE `clips` ADD `framing` text DEFAULT 'desfocado' NOT NULL;--> statement-breakpoint
ALTER TABLE `clips` ADD `crop_x` integer DEFAULT 50 NOT NULL;