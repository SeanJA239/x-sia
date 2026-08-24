PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_certificate` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`serial` text NOT NULL,
	`issued_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `org`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_certificate`("id", "org_id", "user_id", "event_id", "serial", "issued_at") SELECT "id", "org_id", "user_id", "event_id", "serial", "issued_at" FROM `certificate`;--> statement-breakpoint
DROP TABLE `certificate`;--> statement-breakpoint
ALTER TABLE `__new_certificate` RENAME TO `certificate`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `certificate_serial_unique` ON `certificate` (`serial`);--> statement-breakpoint
CREATE INDEX `certificate_org_user_idx` ON `certificate` (`org_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `worn_user_title_id` text REFERENCES user_title(id);--> statement-breakpoint
CREATE INDEX `comment_post_created_idx` ON `comment` (`post_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `event_org_starts_idx` ON `event` (`org_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `post_org_status_created_idx` ON `post` (`org_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `user_title` DROP COLUMN `is_worn`;