import { text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import { users, appSchema } from './users';

export const chats = appSchema.table('chats', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  modelId: text('model_id').notNull(),
  messageCount: integer('message_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert; 