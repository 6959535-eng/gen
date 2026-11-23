CREATE TABLE `fuel_inventories` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`at` integer NOT NULL,
	`fuel_type_id` text NOT NULL,
	`actual_ml` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fuel_inventories_at_idx` ON `fuel_inventories` (`at`);--> statement-breakpoint
CREATE TABLE `fuel_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`at` integer NOT NULL,
	`fuel_type_id` text NOT NULL,
	`volume_ml` integer NOT NULL,
	`recipient` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fuel_issues_at_idx` ON `fuel_issues` (`at`);