CREATE TABLE `health_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`up` integer NOT NULL,
	`response_time` integer NOT NULL,
	`err` text,
	`status_code` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `health_checks` (`timestamp`);--> statement-breakpoint
CREATE INDEX `up_timestamp_idx` ON `health_checks` (`up`,`timestamp`);