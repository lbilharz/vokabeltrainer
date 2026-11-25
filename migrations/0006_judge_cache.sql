CREATE TABLE `judge_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`verdict` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL
);
