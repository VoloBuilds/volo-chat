-- Add R2 support to files table
ALTER TABLE "chat_app"."files" ADD COLUMN "r2_url" text;
ALTER TABLE "chat_app"."files" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL; 