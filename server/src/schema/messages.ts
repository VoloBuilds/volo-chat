import { text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { chats } from './chats';
import { appSchema } from './users';

export interface Attachment {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  url?: string; // Optional as it may not be available until uploaded to R2
  status?: 'pending' | 'uploaded' | 'failed';
}

export const messages = appSchema.table('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  modelId: text('model_id'),
  attachments: jsonb('attachments').$type<Attachment[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert; 