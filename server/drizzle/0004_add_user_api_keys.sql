ALTER TABLE "app"."users" ADD COLUMN "encrypted_openrouter_key" TEXT;
ALTER TABLE "app"."users" ADD COLUMN "openrouter_key_salt" TEXT;
ALTER TABLE "app"."users" ADD COLUMN "openrouter_key_created_at" TIMESTAMP;
ALTER TABLE "app"."users" ADD COLUMN "openrouter_key_updated_at" TIMESTAMP;
ALTER TABLE "app"."users" ADD COLUMN "encrypted_openai_key" text;
ALTER TABLE "app"."users" ADD COLUMN "openai_key_salt" text;
ALTER TABLE "app"."users" ADD COLUMN "openai_key_created_at" text;
ALTER TABLE "app"."users" ADD COLUMN "openai_key_updated_at" text; 
ALTER TABLE "app"."users" ADD COLUMN "custom_instructions" text; 

CREATE INDEX idx_users_encrypted_openrouter_key ON "app"."users" (encrypted_openrouter_key) WHERE encrypted_openrouter_key IS NOT NULL;
CREATE INDEX idx_users_openrouter_key_created_at ON "app"."users" (openrouter_key_created_at);
CREATE INDEX idx_users_openrouter_key_updated_at ON "app"."users" (openrouter_key_updated_at);  