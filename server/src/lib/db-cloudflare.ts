/**
 * Database connection for Cloudflare Workers
 * Uses external PostgreSQL database (Neon, Supabase, etc.)
 * Does not support embedded PostgreSQL
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../schema';
import { getRequiredEnv } from './env';
import { sql } from 'drizzle-orm';

let db: ReturnType<typeof drizzle> | null = null;

export async function getDatabase() {
  if (db) {
    return db;
  }

  try {
    // In Cloudflare Workers, we must use an external database
    const databaseUrl = getRequiredEnv('DATABASE_URL');
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for Cloudflare Workers deployment');
    }

    // Use Neon's HTTP driver which works in Cloudflare Workers
    const sql = neon(databaseUrl);
    db = drizzle(sql, { schema });
    
    return db;
  } catch (error) {
    console.error('Database connection failed:', error);
    throw new Error(`Failed to connect to database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const database = await getDatabase();
    // Simple query to test connection
    await database.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
} 