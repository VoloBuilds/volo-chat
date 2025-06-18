-- Add sharing and branching support to chats table
ALTER TABLE "app"."chats" ADD COLUMN "is_shared" boolean DEFAULT false NOT NULL;
ALTER TABLE "app"."chats" ADD COLUMN "share_id" text UNIQUE;
ALTER TABLE "app"."chats" ADD COLUMN "shared_at" timestamp;
ALTER TABLE "app"."chats" ADD COLUMN "original_chat_id" uuid REFERENCES "app"."chats"("id");
ALTER TABLE "app"."chats" ADD COLUMN "is_branched" boolean DEFAULT false NOT NULL;
ALTER TABLE "app"."chats" ADD COLUMN "branch_point_message_id" uuid REFERENCES "app"."messages"("id");
ALTER TABLE "app"."chats" ADD COLUMN "branched_at" timestamp;

-- Add pinned chats column to users table
ALTER TABLE "app"."users" ADD COLUMN "pinned_chats" text[] DEFAULT '{}' NOT NULL; 

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "chats_share_id_idx" ON "app"."chats"("share_id");
CREATE INDEX IF NOT EXISTS "chats_original_chat_id_idx" ON "app"."chats"("original_chat_id");
CREATE INDEX IF NOT EXISTS "chats_branch_point_message_id_idx" ON "app"."chats"("branch_point_message_id"); 