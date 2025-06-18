import { text, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core';
import { users, appSchema } from './users';

export const chats = appSchema.table('chats', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  modelId: text('model_id').notNull(),
  messageCount: integer('message_count').default(0).notNull(),
  
  // Sharing fields
  isShared: boolean('is_shared').default(false).notNull(),
  shareId: text('share_id').unique(),
  sharedAt: timestamp('shared_at'),
  
  // Branching fields
  isBranched: boolean('is_branched').default(false).notNull(),
  branchPointMessageId: uuid('branch_point_message_id'),
  branchedAt: timestamp('branched_at'),
  
  // Common field for both features
  originalChatId: uuid('original_chat_id'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert; 