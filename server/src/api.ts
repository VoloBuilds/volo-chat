import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth';
import { getDatabase, testDatabaseConnection } from './lib/db-cloudflare';
import { setEnvContext, clearEnvContext, getDatabaseUrl } from './lib/env';
import * as schema from './schema';

// Import route handlers
import { models } from './routes/models';
import { chats } from './routes/chats';
import { fileRoutes } from './routes/files';

const app = new Hono();

// Environment context middleware - only needed for Cloudflare Workers
app.use('*', async (c, next) => {
  setEnvContext(c.env);

  await next();
  // No need to clear context - env vars are the same for all requests
});

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check route - public
app.get('/', (c) => c.json({ status: 'ok', message: 'API is running' }));

// API routes
const api = new Hono();

// Public routes go here (if any)
api.get('/hello', (c) => {
  return c.json({
    message: 'Hello from Hono!',
  });
});

// Database test route - public for testing
api.get('/db-test', async (c) => {
  try {
    // Cloudflare Workers requires external database
    const dbUrl = getDatabaseUrl();
    
    if (!dbUrl) {
      return c.json({
        error: 'DATABASE_URL is required for Cloudflare Workers',
        timestamp: new Date().toISOString(),
      }, 500);
    }
    
    const db = await getDatabase();
    const isHealthy = await testDatabaseConnection();
    
    if (!isHealthy) {
      return c.json({
        error: 'Database connection is not healthy',
        timestamp: new Date().toISOString(),
      }, 500);
    }
    
    const result = await db.select().from(schema.users).limit(5);
    
    return c.json({
      message: 'Database connection successful!',
      users: result,
      connectionHealthy: isHealthy,
      environment: 'Cloudflare Workers',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database test error:', error);
    return c.json({
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Protected routes - require authentication
const protectedRoutes = new Hono();

// Ensure environment context is set for protected routes
protectedRoutes.use('*', async (c, next) => {
  setEnvContext(c.env);
  await next();
});

protectedRoutes.use('*', authMiddleware);

protectedRoutes.get('/me', (c) => {
  const user = c.get('user');
  return c.json({
    user,
    message: 'You are authenticated!',
  });
});

// Mount the protected routes under /protected
api.route('/protected', protectedRoutes);

// Mount chat API routes (public models endpoint, protected everything else)
api.route('/models', models);

// Protected chat routes
const chatRoutes = new Hono();

// Ensure environment context is set for chat routes
chatRoutes.use('*', async (c, next) => {
  setEnvContext(c.env);
  await next();
});

chatRoutes.use('*', authMiddleware);
chatRoutes.route('/chats', chats);
chatRoutes.route('/files', fileRoutes);

api.route('/', chatRoutes);

// Mount the API router
app.route('/api/v1', api);

export default app; 