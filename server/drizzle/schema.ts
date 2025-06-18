import { pgTable, pgSchema, unique, text, timestamp, foreignKey, uuid, integer, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";


export const app = pgSchema("app");

export const users = app.table("users", {
	id: text("id").primaryKey().notNull(),
	email: text("email").notNull(),
	displayName: text("display_name"),
	photoUrl: text("photo_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	pinnedChats: text("pinned_chats").default('{}').array().notNull(),
	// BYOK fields
	encryptedOpenrouterKey: text("encrypted_openrouter_key"),
	openrouterKeySalt: text("openrouter_key_salt"),
	openrouterKeyCreatedAt: timestamp("openrouter_key_created_at", { mode: 'string' }),
	openrouterKeyUpdatedAt: timestamp("openrouter_key_updated_at", { mode: 'string' }),
},
(table) => {
	return {
		usersEmailUnique: unique("users_email_unique").on(table.email),
	}
});

export const files = app.table("files", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	filename: text("filename").notNull(),
	fileType: text("file_type").notNull(),
	fileSize: integer("file_size").notNull(),
	storagePath: text("storage_path").notNull(),
	metadata: jsonb("metadata"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	r2Url: text("r2_url"),
	status: text("status").default('pending').notNull(),
});

export const messages = app.table("messages", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	chatId: uuid("chat_id").notNull(),
	role: text("role").notNull(),
	content: text("content").notNull(),
	modelId: text("model_id"),
	attachments: jsonb("attachments"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		chatIdIdx: index("messages_chat_id_idx").on(table.chatId),
	}
});

export const chats = app.table("chats", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: text("title").notNull(),
	modelId: text("model_id").notNull(),
	messageCount: integer("message_count").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	isShared: boolean("is_shared").default(false).notNull(),
	shareId: text("share_id"),
	sharedAt: timestamp("shared_at", { mode: 'string' }),
	originalChatId: uuid("original_chat_id"),
	isBranched: boolean("is_branched").default(false).notNull(),
	branchPointMessageId: uuid("branch_point_message_id").references(() => messages.id),
	branchedAt: timestamp("branched_at", { mode: 'string' }),
},
(table) => {
	return {
		userIdIdx: index("chats_user_id_idx").on(table.userId),
		updatedAtIdx: index("chats_updated_at_idx").on(table.updatedAt),
		shareIdIdx: index("chats_share_id_idx").on(table.shareId),
		originalChatIdIdx: index("chats_original_chat_id_idx").on(table.originalChatId),
		branchPointMessageIdIdx: index("chats_branch_point_message_id_idx").on(table.branchPointMessageId),
		chatsOriginalChatIdFkey: foreignKey({
			columns: [table.originalChatId],
			foreignColumns: [table.id],
			name: "chats_original_chat_id_fkey"
		}),
		chatsShareIdKey: unique("chats_share_id_key").on(table.shareId),
	}
});