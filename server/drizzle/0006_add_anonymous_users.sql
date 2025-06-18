-- Migration to add support for anonymous users
-- Make email nullable and add isAnonymous field

-- Add isAnonymous column with default false
ALTER TABLE "app"."users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;

-- Drop the NOT NULL constraint on email to allow anonymous users
ALTER TABLE "app"."users" ALTER COLUMN "email" DROP NOT NULL; 