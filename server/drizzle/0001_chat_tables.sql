-- Create app schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS "app";

-- Create chats table
CREATE TABLE IF NOT EXISTS "app"."chats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "app"."users"("id"),
  "title" text NOT NULL,
  "model_id" text NOT NULL,
  "message_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create messages table
CREATE TABLE IF NOT EXISTS "app"."messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" uuid NOT NULL REFERENCES "app"."chats"("id") ON DELETE CASCADE,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
  "content" text NOT NULL,
  "model_id" text,
  "attachments" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create files table
CREATE TABLE IF NOT EXISTS "app"."files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "app"."users"("id"),
  "filename" text NOT NULL,
  "file_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "storage_path" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "chats_user_id_idx" ON "app"."chats"("user_id");
CREATE INDEX IF NOT EXISTS "chats_updated_at_idx" ON "app"."chats"("updated_at");
CREATE INDEX IF NOT EXISTS "messages_chat_id_idx" ON "app"."messages"("chat_id");
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "app"."messages"("created_at");
CREATE INDEX IF NOT EXISTS "files_user_id_idx" ON "app"."files"("user_id"); 