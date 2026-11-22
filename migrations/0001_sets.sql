CREATE TABLE `extract_log` (
	`user_id` text NOT NULL,
	`day` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`user_id` text NOT NULL,
	`set_id` text NOT NULL,
	`data` text,
	`deleted` integer NOT NULL,
	`t` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `set_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sets_user_updated_idx` ON `sets` (`user_id`,`updated_at`);