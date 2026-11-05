ALTER TABLE `clips` ADD `removals` text;--> statement-breakpoint
ALTER TABLE `videos` ADD `kind` text DEFAULT 'curto' NOT NULL;