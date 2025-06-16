-- Create app schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS "app";

-- Create users table
CREATE TABLE IF NOT EXISTS "app"."users" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "display_name" text,
  "photo_url" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
); 