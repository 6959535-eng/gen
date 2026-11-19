CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `auth_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`lock_until` integer,
	`lock_level` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fuel_receipts` (
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
	`supplier` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fuel_receipts_at_idx` ON `fuel_receipts` (`at`);--> statement-breakpoint
CREATE TABLE `fuel_types` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generators` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`inventory_no` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`power_w` integer,
	`fuel_type_id` text NOT NULL,
	`tank_ml` integer NOT NULL,
	`norm_ml_per_h` integer NOT NULL,
	`initial_hours_min` integer DEFAULT 0 NOT NULL,
	`service_interval_min` integer NOT NULL,
	`status` text NOT NULL,
	`responsible` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maintenance` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`generator_id` text NOT NULL,
	`at` integer NOT NULL,
	`meter_min` integer NOT NULL,
	`kind` text NOT NULL,
	`resets_interval` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`performed_by` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `maintenance_gen_idx` ON `maintenance` (`generator_id`,`at`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`op` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`at` integer NOT NULL,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `outbox_unsynced_idx` ON `outbox` (`synced_at`,`id`);--> statement-breakpoint
CREATE TABLE `refuels` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`generator_id` text NOT NULL,
	`fuel_type_id` text NOT NULL,
	`at` integer NOT NULL,
	`volume_ml` integer NOT NULL,
	`is_full` integer NOT NULL,
	`source` text NOT NULL,
	`meter_min` integer,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refuels_gen_idx` ON `refuels` (`generator_id`,`at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_idx` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`pin_hash` text NOT NULL,
	`pin_salt` text NOT NULL,
	`pin_algo` text NOT NULL,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`author_id` text NOT NULL,
	`device_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`generator_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`start_meter_min` integer,
	`end_meter_min` integer,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_sessions_gen_idx` ON `work_sessions` (`generator_id`,`started_at`);