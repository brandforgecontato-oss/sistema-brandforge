CREATE TABLE `agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project` text NOT NULL,
	`prompt` text NOT NULL,
	`mode` text DEFAULT 'planejar' NOT NULL,
	`model` text DEFAULT 'sonnet' NOT NULL,
	`status` text DEFAULT 'na_fila' NOT NULL,
	`parent_id` integer,
	`resume_session_id` text,
	`session_id` text,
	`result` text,
	`cost_usd` real,
	`duration_ms` integer,
	`turns` integer,
	`denials` text,
	`error` text,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `agent_runs_status_idx` ON `agent_runs` (`status`);