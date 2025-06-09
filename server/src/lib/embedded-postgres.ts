import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let embeddedInstance: EmbeddedPostgres | null = null;
let connectionString: string | null = null;

const isDatabaseInitialized = (dataDir: string): boolean => {
  const pgVersionFile = path.join(dataDir, 'PG_VERSION');
  const postgresqlConfFile = path.join(dataDir, 'postgresql.conf');
  return existsSync(pgVersionFile) && existsSync(postgresqlConfFile);
};

export const startEmbeddedPostgres = async (port: number = 5433): Promise<string> => {
  if (embeddedInstance && connectionString) {
    return connectionString;
  }

  console.log('🗄️ Starting embedded PostgreSQL...');

  const dataDir = path.join(__dirname, '../../../data/postgres');
  const isInitialized = isDatabaseInitialized(dataDir);

  embeddedInstance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'password',
    port: port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--lc-collate=C', '--lc-ctype=C']
  });

  try {
    if (!isInitialized) {
      console.log('📦 Initializing PostgreSQL cluster...');
      await embeddedInstance.initialise();
    }

    await embeddedInstance.start();
    connectionString = `postgresql://postgres:password@localhost:${port}/postgres`;
    
    console.log(`✅ Embedded PostgreSQL started on port ${port}`);
    return connectionString;
  } catch (error: any) {
    embeddedInstance = null;
    
    if (error?.message && error.message.includes('postmaster.pid already exists')) {
      console.log('\n🚨 PostgreSQL Database Conflict Detected\n');
      console.log('❌ Another PostgreSQL instance is already running with the same data directory.');
      console.log('   This typically happens when you try to run multiple volo-app instances');
      console.log('   from the same folder.\n');
      console.log('💡 Solutions:');
      console.log('   1. Stop the other volo-app instance first (Ctrl+C)');
      console.log('   2. Copy this project to a different folder if you need multiple instances');
      console.log('   3. Use different PROJECT folders for different volo-apps\n');
      console.log('📁 Current project folder:', path.resolve(__dirname, '../../..'));
      console.log('🔍 PostgreSQL data directory:', dataDir);
      console.log('\n🔄 If you want to run multiple volo-apps simultaneously:');
      console.log('   • Each should be in its own separate folder');
      console.log('   • The dynamic port system will handle port conflicts automatically');
      console.log('   • Each will get its own PostgreSQL database instance\n');
      
      // Provide additional context about the current setup
      console.log('🔍 Troubleshooting:');
      console.log('   • Check if another terminal has this project running');
      console.log('   • Look for other `npm run dev` or `pnpm run dev` processes');
      console.log('   • If you stopped a previous instance abruptly, restart your terminal\n');
      
      process.exit(1);
    } else {
      console.error('❌ Failed to start embedded PostgreSQL:', error?.message || error);
      throw error;
    }
  }
};

export const stopEmbeddedPostgres = async (): Promise<void> => {
  if (!embeddedInstance) return;

  try {
    console.log('🛑 Stopping embedded PostgreSQL...');
    await embeddedInstance.stop();
    embeddedInstance = null;
    connectionString = null;
    console.log('✅ Embedded PostgreSQL stopped');
  } catch (error) {
    console.error('❌ Error stopping embedded PostgreSQL:', error);
    embeddedInstance = null;
    connectionString = null;
  }
};

export const getEmbeddedConnectionString = (): string | null => connectionString;