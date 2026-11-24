CREATE TABLE `usage_log` (
	`scope` text NOT NULL,
	`kind` text NOT NULL,
	`day` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`scope`, `kind`, `day`)
);
