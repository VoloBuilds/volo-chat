import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import getPort from 'get-port';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Finds a clean block of 5 consecutive available ports starting from base port 5500
 * @returns {Promise<Object>} Object with service names mapped to available ports
 */
export async function getAvailablePorts() {
  const defaultPorts = {
    backend: 5500,
    frontend: 5501,
    postgres: 5502,
    firebaseAuth: 5503,
    firebaseUI: 5504
  };

  let basePort = 5500;

  // Try to find a clean block of 5 consecutive ports
  while (basePort < 10000) { // Reasonable upper limit
    const ports = {
      backend: basePort,
      frontend: basePort + 1,
      postgres: basePort + 2,
      firebaseAuth: basePort + 3,
      firebaseUI: basePort + 4
    };

    // Check if all ports in this block are available
    let allAvailable = true;
    for (const [service, port] of Object.entries(ports)) {
      const testPort = await getPort({ port });
      if (testPort !== port) {
        allAvailable = false;
        break;
      }
    }

    if (allAvailable) {
      // Found a clean block, use these ports
      return ports;
    }

    // Jump to next 100-port block
    basePort += 100;
  }

  // Fallback: if we can't find a clean block, use any available ports
  const availablePorts = {};
  for (const [service, defaultPort] of Object.entries(defaultPorts)) {
    availablePorts[service] = await getPort();
  }
  
  return availablePorts;
}

/**
 * Creates a temporary firebase.json configuration with dynamic ports
 * @param {Object} availablePorts - Object with port assignments
 * @returns {string} Path to the created firebase config file
 */
export function createFirebaseConfig(availablePorts) {
  const firebaseConfigPath = path.join(__dirname, '../firebase.json');
  const tempFirebaseConfig = {
    emulators: {
      auth: {
        port: availablePorts.firebaseAuth
      },
      ui: {
        enabled: true,
        port: availablePorts.firebaseUI
      }
    }
  };
  
  // Write temporary config
  writeFileSync(firebaseConfigPath, JSON.stringify(tempFirebaseConfig, null, 2));
  
  return firebaseConfigPath;
}

/**
 * Reads the current content of the server .env file
 * @returns {Object|null} Object with {content: string, path: string} or null if file doesn't exist
 */
export function readServerEnv() {
  const envPath = path.join(__dirname, '../server/.env');
  
  if (!existsSync(envPath)) {
    return null;
  }

  try {
    const content = readFileSync(envPath, 'utf-8');
    return { content, path: envPath };
  } catch (error) {
    console.error('⚠️ Warning: Could not read server .env file:', error.message);
    return null;
  }
}

/**
 * Updates server .env file with dynamic port configuration
 * @param {Object} availablePorts - Object with port assignments
 * @param {boolean} useWrangler - Whether running in Wrangler mode
 * @returns {Object|null} Original env state for restoration, or null if no changes made
 */
export function updateServerEnvWithPorts(availablePorts, useWrangler) {
  if (useWrangler) {
    // For Wrangler mode, don't modify .env as it should use remote database
    return null;
  }

  const envData = readServerEnv();
  if (!envData) {
    console.error('❌ No server .env file found. Cannot update dynamic ports.');
    return null;
  }

  try {
    let updatedContent = envData.content;
    let hasChanges = false;
    const changesTracked = {
      path: envData.path,
      modifications: []
    };
    
    // Only update DATABASE_URL if it's currently pointing to localhost (embedded postgres)
    const currentDbUrl = envData.content.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
    if (currentDbUrl && currentDbUrl.includes('localhost')) {
      const originalDbLine = envData.content.match(/DATABASE_URL=.+/)?.[0];
      const newDbLine = `DATABASE_URL=postgresql://postgres:password@localhost:${availablePorts.postgres}/postgres`;
      
      if (originalDbLine && originalDbLine !== newDbLine) {
        updatedContent = updatedContent.replace(
          /DATABASE_URL=postgresql:\/\/postgres:password@localhost:\d+\/postgres/,
          newDbLine
        );
        hasChanges = true;
        changesTracked.modifications.push({
          type: 'replace',
          original: originalDbLine,
          modified: newDbLine
        });
        console.log(`📝 Updated embedded PostgreSQL port to ${availablePorts.postgres}`);
      }
    }
    
    // Only add/update Firebase Auth emulator if we're not using production Firebase
    const firebaseProjectMatch = envData.content.match(/FIREBASE_PROJECT_ID=(.+)/);
    const firebaseProjectId = firebaseProjectMatch?.[1]?.trim();
    const isUsingLocalFirebase = !firebaseProjectId || firebaseProjectId === 'demo-project';
    
    if (isUsingLocalFirebase) {
      const firebaseAuthLine = `FIREBASE_AUTH_EMULATOR_HOST=localhost:${availablePorts.firebaseAuth}`;
      
      if (updatedContent.includes('FIREBASE_AUTH_EMULATOR_HOST=')) {
        const originalFirebaseLine = envData.content.match(/FIREBASE_AUTH_EMULATOR_HOST=.+/)?.[0];
        if (originalFirebaseLine && originalFirebaseLine !== firebaseAuthLine) {
          updatedContent = updatedContent.replace(
            /FIREBASE_AUTH_EMULATOR_HOST=localhost:\d+/,
            firebaseAuthLine
          );
          hasChanges = true;
          changesTracked.modifications.push({
            type: 'replace',
            original: originalFirebaseLine,
            modified: firebaseAuthLine
          });
        }
      } else {
        const firebaseSection = `\n# Firebase Auth Emulator (dynamically set)\n${firebaseAuthLine}\n`;
        updatedContent += firebaseSection;
        hasChanges = true;
        changesTracked.modifications.push({
          type: 'append',
          added: firebaseSection
        });
      }
      console.log(`📝 Updated Firebase Auth emulator port to ${availablePorts.firebaseAuth}`);
    }
    
    // Only write if content actually changed
    if (hasChanges && updatedContent !== envData.content) {
      writeFileSync(envData.path, updatedContent);
      
      // Return tracked changes for intelligent restoration
      return changesTracked;
    }
    
    return null;
  } catch (error) {
    console.error('⚠️ Warning: Could not update server .env file:', error.message);
    return null;
  }
}

/**
 * Restores only the specific dynamic changes made by the script, preserving other modifications
 * @param {Object|null} envState - Tracked changes from updateServerEnvWithPorts
 */
export function restoreEnvFile(envState) {
  if (!envState || !envState.modifications || envState.modifications.length === 0) {
    return;
  }

  if (!existsSync(envState.path)) {
    return;
  }

  try {
    let currentContent = readFileSync(envState.path, 'utf-8');
    let hasChanges = false;

    // Apply changes in reverse order to handle appends correctly
    for (let i = envState.modifications.length - 1; i >= 0; i--) {
      const change = envState.modifications[i];
      
      if (change.type === 'replace') {
        // Only revert if our modified line is still present (unchanged by user)
        if (currentContent.includes(change.modified)) {
          currentContent = currentContent.replace(change.modified, change.original);
          hasChanges = true;
        }
      } else if (change.type === 'append') {
        // Only remove if our appended content is still present at the end
        if (currentContent.endsWith(change.added)) {
          currentContent = currentContent.slice(0, -change.added.length);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      writeFileSync(envState.path, currentContent);
      console.log('✅ Restored original server .env file (preserving user changes)');
    }
  } catch (error) {
    console.error('⚠️ Warning: Could not restore server .env file:', error.message);
  }
}

/**
 * Removes the temporary firebase.json file
 * @param {string} firebaseConfigPath - Path to the firebase config file
 */
export function cleanupFirebaseConfig(firebaseConfigPath) {
  if (firebaseConfigPath && existsSync(firebaseConfigPath)) {
    try {
      unlinkSync(firebaseConfigPath);
    } catch (error) {
      // Silent cleanup failure
    }
  }
}

/**
 * Checks if database configuration is valid for the given mode
 * @param {boolean} useWrangler - Whether running in Wrangler mode
 * @returns {boolean} True if configuration is valid
 */
export function checkDatabaseConfiguration(useWrangler) {
  const envPath = path.join(__dirname, '../server/.env');
  if (!existsSync(envPath)) {
    if (useWrangler) {
      console.error('❌ No .env file found. Cloudflare Workers requires DATABASE_URL to be set.');
      console.error('   Please create server/.dev.vars with a remote database URL.');
      return false;
    }
    console.error('❌ No .env file found. Run `pnpm run setup:local` first to set up your database.');
    return false;
  }

  const envContent = readFileSync(envPath, 'utf-8');
  const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim();

  if (!dbUrl) {
    console.error('❌ No DATABASE_URL found in .env file.');
    if (useWrangler) {
      console.error('   Please add DATABASE_URL to server/.dev.vars with a remote database.');
    } else {
      console.error('   Run `pnpm run setup:local` to set up embedded PostgreSQL.');
    }
    return false;
  }

  // If using Wrangler and database is localhost, that's a problem
  if (useWrangler && dbUrl.includes('localhost')) {
    console.error('❌ Cloudflare Workers Configuration Issue:');
    console.error('   Embedded PostgreSQL cannot run in Cloudflare Workers environment.');
    console.error('   Please update DATABASE_URL in server/.dev.vars to point to a remote database.');
    console.error('   Supported options:');
    console.error('   • Neon (recommended): postgresql://user:pass@host.neon.tech/db');
    console.error('   • Supabase, Railway, or other PostgreSQL providers');
    return false;
  }

  // If not using Wrangler but we have a remote database, that's fine too
  if (!useWrangler && !dbUrl.includes('localhost')) {
    console.log('✅ Using remote database with Node.js server');
  }

  return true;
}

/**
 * Gets the database URL for display purposes
 * @param {Object} availablePorts - Object with port assignments
 * @param {boolean} useWrangler - Whether running in Wrangler mode
 * @returns {string} Database URL string
 */
export function getDatabaseUrl(availablePorts, useWrangler) {
  let databaseUrl = `postgresql://postgres:password@localhost:${availablePorts.postgres}/postgres`;
  
  if (useWrangler) {
    // For Cloudflare Workers, try to read the actual DATABASE_URL
    const envData = readServerEnv();
    if (envData) {
      try {
        const dbUrlMatch = envData.content.match(/DATABASE_URL=(.+)/);
        if (dbUrlMatch) {
          databaseUrl = dbUrlMatch[1];
        }
      } catch (error) {
        // Silent fallback
      }
    }
  }
  
  return databaseUrl;
} 