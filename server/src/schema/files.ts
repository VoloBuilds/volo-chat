import { text, timestamp, uuid, integer, jsonb } from 'drizzle-orm/pg-core';
import { users, appSchema } from './users';

export const files = appSchema.table('files', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  filename: text('filename').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  storagePath: text('storage_path').notNull(),
  r2Url: text('r2_url'),
  status: text('status').notNull().default('pending'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type FileRecord = typeof files.$inferSelect;
export type NewFileRecord = typeof files.$inferInsert; 