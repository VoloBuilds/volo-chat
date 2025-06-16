import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './api';
import { getEnv, getDatabaseUrl } from './lib/env';

// NOTE: This server.ts is for Node.js development only
// For Cloudflare Workers deployment, use `wrangler dev` or `wrangler deploy`
// which uses src/index.ts as the entry point

// Parse CLI arguments
const parseCliArgs = () => {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  
  return {
    port: portIndex !== -1 ? parseInt(args[portIndex + 1]) : parseInt(getEnv('PORT', '8787')!),
  };
};

const { port } = parseCliArgs();

const startServer = async () => {
  const dbUrl = getDatabaseUrl();
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is required. Please set it in your .env file');
    console.log('💡 For Cloudflare Workers deployment, use: wrangler dev');
    process.exit(1);
  }

  console.log(`🚀 Starting Node.js development server on port ${port}`);
  console.log('🔗 Using external database connection');
  console.log('💡 For Cloudflare Workers deployment, use: wrangler dev');

  serve({
    fetch: app.fetch,
    port,
  });
};

// Graceful shutdown
const shutdown = async () => {
  console.log('🛑 Shutting down server...');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer(); 