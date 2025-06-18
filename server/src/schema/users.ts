import { pgSchema, pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// Create private schema for application tables
export const appSchema = pgSchema('app');

export const users = appSchema.table('users', {
  id: text('id').primaryKey(),
  email: text('email').unique(),
  display_name: text('display_name'),
  photo_url: text('photo_url'),
  isAnonymous: boolean('is_anonymous').default(false).notNull(),
  pinned_chats: text('pinned_chats').array().default([]).notNull(),
  // API key fields for BYOK (Bring Your Own Key)
  encryptedOpenrouterKey: text('encrypted_openrouter_key'),
  openrouterKeySalt: text('openrouter_key_salt'),
  openrouterKeyCreatedAt: text('openrouter_key_created_at'),
  openrouterKeyUpdatedAt: text('openrouter_key_updated_at'),
  // OpenAI API key fields
  encryptedOpenaiKey: text('encrypted_openai_key'),
  openaiKeySalt: text('openai_key_salt'),
  openaiKeyCreatedAt: text('openai_key_created_at'),
  openaiKeyUpdatedAt: text('openai_key_updated_at'),
  // Custom instructions for AI interactions
  customInstructions: text('custom_instructions'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert; 