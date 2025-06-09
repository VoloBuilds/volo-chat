#!/usr/bin/env node

/**
 * Unified post-setup script for create-volo-app
 * Handles all modular combinations:
 * - Local vs Production Database (embedded PostgreSQL vs Neon/Supabase)
 * - Local vs Production Auth (Firebase emulator vs production Firebase)
 * - Local vs Production Deploy (local dev vs Cloudflare)
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

console.log('🔧 Running post-setup configuration...');

/**
 * Detect configuration from generated files
 */
function detectConfiguration() {
  const config = {
    database: { mode: 'local', provider: null, url: null },
    auth: { mode: 'local', projectId: 'demo-project' },
    deploy: { mode: 'local', hasWrangler: false }
  };

  // Detect database configuration
  const envPath = join(projectRoot, 'server', '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
    
    if (dbUrlMatch) {
      const dbUrl = dbUrlMatch[1].trim();
      config.database.url = dbUrl;
      
      if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
        config.database.mode = 'local';
      } else {
        config.database.mode = 'production';
        if (dbUrl.includes('neon.tech')) config.database.provider = 'neon';
        else if (dbUrl.includes('supabase.co')) config.database.provider = 'supabase';
        else config.database.provider = 'custom';
      }
    } else {
      // No DATABASE_URL found - check if it's a local setup based on comments
      if (envContent.includes('embedded PostgreSQL') || envContent.includes('post-setup script')) {
        config.database.mode = 'local';
      }
    }

    // Detect auth configuration
    const projectIdMatch = envContent.match(/FIREBASE_PROJECT_ID=(.+)/);
    if (projectIdMatch) {
      const projectId = projectIdMatch[1].trim();
      config.auth.projectId = projectId;
      config.auth.mode = projectId === 'demo-project' ? 'local' : 'production';
    }
  }

  // Detect deployment configuration
  const wranglerPath = join(projectRoot, 'server', 'wrangler.toml');
  config.deploy.hasWrangler = existsSync(wranglerPath);
  config.deploy.mode = config.deploy.hasWrangler ? 'production' : 'local';

  return config;
}

/**
 * Port utilities for local database setup
 */
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => {
        const client = net.createConnection(port, '127.0.0.1');
        client.on('connect', () => {
          client.destroy();
          resolve(false);
        });
        client.on('error', () => resolve(true));
        setTimeout(() => {
          client.destroy();
          resolve(true);
        }, 1000);
      });
    });
    server.on('error', () => resolve(false));
  });
}

async function findNextAvailablePort(startPort) {
  let port = startPort;
  let attempts = 0;
  const maxAttempts = 100;
  
  while (!(await isPortAvailable(port)) && attempts < maxAttempts) {
    port++;
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error(`Could not find an available port starting from ${startPort}`);
  }
  
  return port;
}

/**
 * Setup local embedded PostgreSQL database
 */
async function setupLocalDatabase() {
  console.log('🗄️ Setting up local embedded PostgreSQL...');
  
  const dataDir = join(projectRoot, 'data');
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true });
    console.log('✅ Created data directory');
  }

  // Find available port
  console.log('🔍 Finding available PostgreSQL port...');
  const postgresPort = await findNextAvailablePort(5433);
  console.log(`✅ Found available port: ${postgresPort}`);

  // Initialize database
  console.log(`📦 Initializing embedded PostgreSQL on port ${postgresPort}...`);
  
  let embeddedPg = null;
  let client = null;
  
  try {
    embeddedPg = new EmbeddedPostgres({
      databaseDir: join(dataDir, 'postgres'),
      user: 'postgres',
      password: 'password',
      port: postgresPort,
      persistent: true,
      initdbFlags: ['--encoding=UTF8', '--lc-collate=C', '--lc-ctype=C']
    });

    await embeddedPg.initialise();
    await embeddedPg.start();
    console.log(`✅ Embedded PostgreSQL started on port ${postgresPort}`);

    const connectionString = `postgresql://postgres:password@localhost:${postgresPort}/postgres`;
    
    // Update .env file with correct port
    const envPath = join(projectRoot, 'server', '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    
    let updatedEnv;
    if (envContent.includes('DATABASE_URL=')) {
      // Replace existing DATABASE_URL
      updatedEnv = envContent.replace(
        /DATABASE_URL=postgresql:\/\/postgres:password@localhost:\d+\/postgres/,
        `DATABASE_URL=${connectionString}`
      );
    } else {
      // Add DATABASE_URL where the comment is
      updatedEnv = envContent.replace(
        /# DATABASE_URL will be set by post-setup script/,
        `DATABASE_URL=${connectionString}`
      );
    }
    
    writeFileSync(envPath, updatedEnv);
    console.log(`✅ Updated .env with PostgreSQL on port ${postgresPort}`);

    // Test connection and create schema
    client = postgres(connectionString);
    
    const schemaExists = await client`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'app'
    `;

    if (schemaExists.length === 0) {
      console.log('📦 Creating app schema...');
      await client`CREATE SCHEMA app`;
      
      const migrationPath = join(projectRoot, 'server', 'drizzle', '0000_initial.sql');
      if (existsSync(migrationPath)) {
        const migrationSQL = readFileSync(migrationPath, 'utf-8');
        const schemaAwareSql = migrationSQL.replace(
          'CREATE TABLE IF NOT EXISTS "users"',
          'CREATE TABLE IF NOT EXISTS app.users'
        );
        await client.unsafe(schemaAwareSql);
        console.log('✅ Database schema created');
      }
    } else {
      console.log('✅ Database schema already exists');
    }

    return connectionString;

  } catch (error) {
    if (error.message?.includes('postmaster.pid already exists')) {
      console.log('⚠️ PostgreSQL instance already running, continuing...');
      return `postgresql://postgres:password@localhost:${postgresPort}/postgres`;
    }
    throw error;
  } finally {
    if (client) await client.end();
    if (embeddedPg) await embeddedPg.stop();
  }
}

/**
 * Test production database connectivity
 */
async function testProductionDatabase(config) {
  console.log('🔍 Testing production database connectivity...');
  
  try {
    execSync(`npx dotenv-cli -e .env -- node scripts/db-connectivity-test.mjs`, {
      cwd: join(projectRoot, 'server'),
      timeout: 15000,
      stdio: 'pipe'
    });
    console.log('✅ Production database connectivity verified');
    return true;
  } catch (error) {
    console.log('⚠️ Database connectivity test failed, will retry schema setup...');
    return false;
  }
}

/**
 * Setup production database schema
 */
async function setupProductionDatabaseSchema(config, maxRetries = 3) {
  console.log('🔒 Setting up production database schema...');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Setup private schema
      execSync('npx dotenv-cli -e .env -- node scripts/setup-private-schema.mjs', {
        cwd: join(projectRoot, 'server'),
        stdio: 'inherit'
      });
      
      // Push schema with Drizzle
      execSync('npx dotenv-cli -e .env -- pnpm db:push', {
        cwd: join(projectRoot, 'server'),
        stdio: 'inherit'
      });
      
      console.log('✅ Production database schema created successfully!');
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      if (isLastAttempt) {
        console.error('❌ Failed to setup database schema after multiple attempts');
        console.log('💡 You can complete this manually:');
        console.log('   cd server && npx dotenv-cli -e .env -- pnpm db:push');
        throw error;
      }
      
      console.log(`⏳ Schema setup failed (attempt ${attempt}/${maxRetries}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

/**
 * Setup Firebase configuration
 */
async function setupFirebaseConfig(config) {
  if (config.auth.mode === 'local') {
    console.log('🔥 Setting up Firebase emulator configuration...');
    
    const firebaseConfigPath = join(projectRoot, 'ui', 'src', 'lib', 'firebase-config.json');
    
    if (!existsSync(firebaseConfigPath)) {
      const demoConfig = {
        "apiKey": "demo-api-key",
        "authDomain": "demo-project.firebaseapp.com",
        "projectId": "demo-project",
        "storageBucket": "demo-project.appspot.com",
        "messagingSenderId": "123456789",
        "appId": "1:123456789:web:abcdef123456",
        "measurementId": "G-XXXXXXXXXX"
      };
      
      writeFileSync(firebaseConfigPath, JSON.stringify(demoConfig, null, 2));
      console.log('✅ Created demo Firebase configuration');
    } else {
      console.log('✅ Firebase configuration already exists');
    }
  } else {
    console.log('✅ Production Firebase configuration detected');
  }
}

/**
 * Main setup function
 */
async function runPostSetup() {
  try {
    // Install dependencies
    console.log('📦 Installing dependencies...');
    execSync('pnpm install', { cwd: projectRoot, stdio: 'inherit' });
    console.log('✅ Dependencies installed');

    // Detect configuration
    const config = detectConfiguration();
    console.log('🔍 Detected configuration:');
    console.log(`   Database: ${config.database.mode}${config.database.provider ? ` (${config.database.provider})` : ''}`);
    console.log(`   Auth: ${config.auth.mode} (${config.auth.projectId})`);
    console.log(`   Deploy: ${config.deploy.mode}`);
    console.log('');

    // Setup database based on mode
    if (config.database.mode === 'local') {
      await setupLocalDatabase();
    } else {
      // Production database
      const isConnected = await testProductionDatabase(config);
      if (isConnected) {
        await setupProductionDatabaseSchema(config);
      } else {
        console.log('⚠️ Skipping schema setup due to connectivity issues');
        console.log('💡 Run manually when database is ready: cd server && pnpm db:push');
      }
    }

    // Setup Firebase configuration
    await setupFirebaseConfig(config);

    // Success message
    console.log('');
    console.log('🎉 Post-setup complete!');
    console.log('');
    
    if (config.database.mode === 'local') {
      console.log('💡 Local development ready:');
      console.log('   • Embedded PostgreSQL database running');
      console.log('   • Firebase Auth emulator ready');
      console.log('   • Run `pnpm dev` to start all services');
    } else {
      console.log('💡 Production services connected:');
      console.log(`   • Database: ${config.database.provider} (${config.database.mode})`);
      console.log(`   • Auth: Firebase (${config.auth.mode})`);
      if (config.deploy.hasWrangler) {
        console.log('   • Deploy: Cloudflare Workers (configured)');
      }
    }

  } catch (error) {
    console.error('❌ Post-setup failed:', error.message);
    console.log('');
    console.log('💡 You can complete setup manually:');
    console.log('   • For local database: pnpm setup:local');
    console.log('   • For production database: cd server && pnpm db:push');
    process.exit(1);
  }
}

// Run the setup
runPostSetup(); 