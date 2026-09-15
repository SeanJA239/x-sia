CREATE TABLE `wiki_page` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`slug` text NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`last_mutation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `org`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_page_org_slug_unique` ON `wiki_page` (`org_id`,`slug`);--> statement-breakpoint
CREATE TABLE `wiki_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`page_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '未分类' NOT NULL,
	`body_md` text NOT NULL,
	`change_note` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `org`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`page_id`) REFERENCES `wiki_page`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_revision_page_number_unique` ON `wiki_revision` (`page_id`,`number`);