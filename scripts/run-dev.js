#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getAvailablePorts,
  createFirebaseConfig,
  updateServerEnvWithPorts,
  restoreEnvFile,
  cleanupFirebaseConfig,
  checkDatabaseConfiguration,
  getDatabaseUrl,
  readServerEnv
} from './port-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCliArgs() {
  const args = process.argv.slice(2);
  return {
    useWrangler: args.includes('--wrangler') || args.includes('--cloudflare'),
    help: args.includes('--help') || args.includes('-h')
  };
}

/**
 * Detects if we're using production services or local emulators
 * @returns {Object} Configuration detection results
 */
function detectEnvironmentConfiguration() {
  const envData = readServerEnv();
  
  if (!envData) {
    return {
      useLocalFirebase: true,
      useLocalDatabase: true,
      isProduction: false
    };
  }

  try {
    const envContent = envData.content;
    
    // Check if we have a real Firebase project ID (not 'demo-project')
    const firebaseProjectMatch = envContent.match(/FIREBASE_PROJECT_ID=(.+)/);
    const firebaseProjectId = firebaseProjectMatch?.[1]?.trim();
    const useLocalFirebase = !firebaseProjectId || firebaseProjectId === 'demo-project';
    
    // Check if we have a remote database URL (not localhost)
    const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
    const databaseUrl = dbUrlMatch?.[1]?.trim();
    const useLocalDatabase = !databaseUrl || databaseUrl.includes('localhost');
    
    const isProduction = !useLocalFirebase || !useLocalDatabase;
    
    return {
      useLocalFirebase,
      useLocalDatabase,
      isProduction,
      firebaseProjectId,
      databaseUrl
    };
  } catch (error) {
    console.warn('⚠️  Could not detect environment configuration, defaulting to local mode');
    return {
      useLocalFirebase: true,
      useLocalDatabase: true,
      isProduction: false
    };
  }
}

function showHelp() {
  console.log(`
🌊 volo-app Development Server

Usage:
  npm run dev                    Start with Node.js server (default)
  npm run dev -- --wrangler     Start with Cloudflare Wrangler dev server
  npm run dev -- --help         Show this help

Features:
  ✅ Automatic port conflict detection and resolution
  ✅ Multiple instance support (run several volo-apps simultaneously)
  ✅ Smart production/local service detection
  ✅ Cloudflare Workers compatibility

Notes:
  • Automatically detects if you're using production or local services
  • When using --wrangler, embedded PostgreSQL is not available
  • For Cloudflare Workers, ensure DATABASE_URL points to a remote database
`);
}

function handleError(error, message = 'Failed to start services') {
  console.error(`❌ ${message}:`, error.message || error);
  process.exit(1);
}

function showServiceInfo(availablePorts, useWrangler, config) {
  console.log('🎉 Your app is ready at:');
  console.log(`   Frontend:  \x1b[32mhttp://localhost:${availablePorts.frontend}\x1b[0m`);
  console.log(`   Backend:   http://localhost:${availablePorts.backend}`);
  
  if (config.useLocalFirebase) {
    console.log(`   Firebase Emulator UI:  http://localhost:${availablePorts.firebaseUI}`);
  } else {
    console.log(`   Firebase: Production (${config.firebaseProjectId})`);
  }
  
  if (config.useLocalDatabase) {
    console.log(`   Database:  ${getDatabaseUrl(availablePorts, useWrangler)}`);
  } else {
    console.log(`   Database: Production database`);
  }
  
  if (useWrangler) {
    console.log('\n⚡ Running in Cloudflare Workers mode');
  } else {
    console.log('\n🗄️  Using Node.js server');
  }
  
  if (config.isProduction) {
    console.log('\n🏭 Production services detected');
    if (!config.useLocalFirebase) {
      console.log(`   • Firebase: ${config.firebaseProjectId}`);
    }
    if (!config.useLocalDatabase) {
      console.log('   • Database: Remote PostgreSQL');
    }
  } else {
    console.log('\n🧪 Local development mode');
    if (config.useLocalDatabase && !useWrangler) {
      console.log('   • Using embedded PostgreSQL database');
    }
    if (config.useLocalFirebase) {
      console.log('   • Using Firebase Auth emulator');
    }
  }
  
  console.log('\n📋 Live service logs:\n');
}

async function startServices() {
  const cliArgs = parseCliArgs();
  
  if (cliArgs.help) {
    showHelp();
    return;
  }

  console.log('🚀 Starting volo-app development server...\n');

  // Store cleanup state
  let envState = null;
  let firebaseConfigPath = null;

  try {
    // Detect environment configuration
    const config = detectEnvironmentConfiguration();
    
    // Get available ports
    const availablePorts = await getAvailablePorts();
    
    // Check database configuration for Cloudflare Workers mode
    if (!checkDatabaseConfiguration(cliArgs.useWrangler)) {
      process.exit(1);
    }

    // Update .env files with dynamic ports (only for local services)
    if (config.useLocalDatabase || config.useLocalFirebase) {
      envState = updateServerEnvWithPorts(availablePorts, cliArgs.useWrangler);
    }

    // Create temporary firebase.json for emulator (only if using local Firebase)
    if (config.useLocalFirebase) {
      firebaseConfigPath = createFirebaseConfig(availablePorts);
    }

    // Build commands based on configuration
    const commands = [];
    
    // Add Firebase emulator if using local Firebase
    if (config.useLocalFirebase) {
      commands.push(`"firebase emulators:start --only auth --project demo-project --export-on-exit=./data/firebase-emulator --import=./data/firebase-emulator"`);
      // Add periodic backup script to prevent data loss during crashes
      commands.push(`"node ./scripts/periodic-emulator-backup.js"`);
    }
    
    // Add backend server
    if (cliArgs.useWrangler) {
      commands.push(`"cd server && wrangler dev --port ${availablePorts.backend} --local-protocol http"`);
    } else {
      const serverCmd = config.useLocalDatabase 
        ? `"cd server && pnpm run dev -- --port ${availablePorts.backend}"`
        : `"cd server && pnpm run dev -- --port ${availablePorts.backend}"`;
      commands.push(serverCmd);
    }
    
    // Add frontend server
    const frontendArgs = [
      `--port ${availablePorts.frontend}`,
      '--strictPort',
      `--api-url http://localhost:${availablePorts.backend}`
    ];
    
    if (config.useLocalFirebase) {
      frontendArgs.push('--use-firebase-emulator true');
      frontendArgs.push(`--firebase-auth-port ${availablePorts.firebaseAuth}`);
    } else {
      frontendArgs.push('--use-firebase-emulator false');
    }
    
    const frontendCmd = `"cd ui && pnpm run dev -- ${frontendArgs.join(' ')}"`;
    commands.push(frontendCmd);

    // Start loading animation
    const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinnerIndex = 0;
    let dotCount = 0;
    
    const spinnerInterval = setInterval(() => {
      const dots = '.'.repeat((dotCount % 4));
      const spaces = ' '.repeat(3 - dots.length);
      
      process.stdout.write(`\r${spinnerChars[spinnerIndex]} Starting services${dots}${spaces}`);
      
      spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
      dotCount++;
    }, 150);

    // Determine service names and colors based on configuration
    const serviceNames = [];
    const serviceColors = [];
    
    if (config.useLocalFirebase) {
      serviceNames.push('firebase');
      serviceColors.push('cyan');
      serviceNames.push('backup');
      serviceColors.push('yellow');
    }
    serviceNames.push('server');
    serviceColors.push('magenta');
    serviceNames.push('frontend');
    serviceColors.push('green');

    // Start services with clean output monitoring
    const child = spawn('npx', [
      'concurrently', 
      '-c', serviceColors.join(','),
      '-n', serviceNames.join(','),
      '--handle-input',
      '--success', 'first',
      ...commands
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],  // Capture stdout/stderr initially
      shell: true,
      cwd: path.join(__dirname, '..')
    });

    let startupComplete = false;
    let startupTimeout;
    let servicesStarted = new Set();
    let capturedOutput = '';

    // Set a timeout for startup detection
    const timeoutDuration = config.useLocalFirebase ? 15000 : 10000; // Shorter timeout if no Firebase emulator
    startupTimeout = setTimeout(() => {
      if (!startupComplete) {
        clearInterval(spinnerInterval);
        process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear spinner line
        
        // Show any captured output first
        if (capturedOutput) {
          process.stdout.write(capturedOutput);
        }
        console.log('✅ All services are starting up...\n');
        showServiceInfo(availablePorts, cliArgs.useWrangler, config);
        startupComplete = true;
        // Switch to live output
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
      }
    }, timeoutDuration);

    // Monitor output for service startup indicators
    child.stdout.on('data', (data) => {
      const output = data.toString();
      
      if (!startupComplete) {
        // Capture output during startup
        capturedOutput += output;
        
        // Look for the key startup indicators
        if (config.useLocalFirebase && (output.includes('Auth Emulator') || output.includes('emulator started'))) {
          servicesStarted.add('firebase');
        }
        if (output.includes('VITE') && output.includes('ready')) {
          servicesStarted.add('frontend');
        }
        if (output.includes('🚀 Starting Node.js server') || output.includes('API available')) {
          servicesStarted.add('server');
        }

        // Check for startup completion
        const completionCondition = config.useLocalFirebase 
          ? (output.includes('All emulators ready!') || output.includes('✔  All emulators ready!'))
          : (servicesStarted.has('server') && servicesStarted.has('frontend'));
          
        if (completionCondition) {
          clearTimeout(startupTimeout);
          if (!startupComplete) {
            // Wait a moment for output to settle
            setTimeout(() => {
              clearInterval(spinnerInterval);
              process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear spinner line
              
              // Show all the captured startup output first
              process.stdout.write(capturedOutput);
              
              console.log('✅ All services started successfully!\n');
              showServiceInfo(availablePorts, cliArgs.useWrangler, config);
              startupComplete = true;
              // Switch to live output for ongoing logs
              child.stdout.pipe(process.stdout);
              child.stderr.pipe(process.stderr);
            }, 1000);
          }
        }
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      
      if (!startupComplete) {
        // Check for startup errors
        if (output.includes('Error:') || output.includes('error') || output.includes('failed')) {
          clearTimeout(startupTimeout);
          console.error('❌ Error during startup:');
          console.error(output);
          process.exit(1);
        }
      }
    });

    // Cleanup function
    const cleanup = () => {
      if (envState) {
        restoreEnvFile(envState);
      }
      if (firebaseConfigPath) {
        cleanupFirebaseConfig(firebaseConfigPath);
      }
    };

    // Cleanup on exit
    ['SIGINT', 'SIGTERM', 'SIGBREAK'].forEach(signal => {
      process.on(signal, () => {
        console.log(`\n🛑 Shutting down services...`);
        cleanup();
        process.exit(0);
      });
    });

    child.on('exit', (code) => {
      cleanup();
      if (code !== 0) {
        console.log(`\n❌ Services stopped with error code ${code}`);
      }
      process.exit(code);
    });

    child.on('error', (error) => {
      handleError(error, 'Error starting services');
    });

  } catch (error) {
    handleError(error);
  }
}

startServices().catch((error) => {
  handleError(error);
});