import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as createDrizzlePostgres } from 'drizzle-orm/postgres-js';
import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import * as schema from '../schema/users';
import { getEmbeddedConnectionString } from './embedded-postgres';

type DatabaseConnection = ReturnType<typeof drizzle> | ReturnType<typeof createDrizzlePostgres>;

let cachedConnection: DatabaseConnection | null = null;
let cachedConnectionString: string | null = null;

const isNeonDatabase = (connectionString: string): boolean => {
  return connectionString.includes('neon.tech') || connectionString.includes('neon.database');
};

const createConnection = async (connectionString: string): Promise<DatabaseConnection> => {
  if (isNeonDatabase(connectionString)) {
    const sql = neon(connectionString);
    return drizzle(sql, { schema });
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

  return createDrizzlePostgres(client, { schema });
};

export const getDatabase = async (connectionString?: string): Promise<DatabaseConnection> => {
  // Use embedded PostgreSQL connection if no external connection string provided
  const connStr = connectionString || getEmbeddedConnectionString();

  if (cachedConnection && cachedConnectionString === connStr) {
    return cachedConnection;
  }

  if (!connStr) {
    throw new Error('No database connection available. Ensure embedded PostgreSQL is started or provide a connection string.');
  }

  cachedConnection = await createConnection(connStr);
  cachedConnectionString = connStr;

  return cachedConnection;
};

export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    if (!cachedConnection) return false;
    await cachedConnection.select().from(schema.users).limit(1);
    return true;
  } catch {
    return false;
  }
};

export const clearConnectionCache = (): void => {
  cachedConnection = null;
  cachedConnectionString = null;
};