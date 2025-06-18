import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from './middleware/auth';
import { getDatabase, testDatabaseConnection } from './lib/db-cloudflare';
import { setEnvContext, clearEnvContext, getDatabaseUrl } from './lib/env';
import * as schema from './schema';

// Import route handlers
import { models } from './routes/models';
import { chats } from './routes/chats';
import { fileRoutes } from './routes/files';
import { userManagement } from './routes/user-management';
import { imageGeneration } from './routes/image-generation';

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

// Public sharing endpoint (no auth required for viewing)
api.get('/shared/:shareId', async (c) => {
  try {
    const shareId = c.req.param('shareId');
    const db = await getDatabase();

    // Find shared chat
    const [sharedChat] = await db
      .select()
      .from(schema.chats)
      .where(
        and(
          eq(schema.chats.shareId, shareId),
          eq(schema.chats.isShared, true)
        )
      );

    if (!sharedChat) {
      return c.json({ error: 'Shared chat not found' }, 404);
    }

    // Get messages
    const chatMessages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.chatId, sharedChat.id))
      .orderBy(schema.messages.createdAt);

    return c.json({
      chat: {
        id: sharedChat.id,
        title: sharedChat.title,
        modelId: sharedChat.modelId,
        createdAt: sharedChat.createdAt,
        messageCount: sharedChat.messageCount,
      },
      messages: chatMessages,
    });
  } catch (error) {
    console.error('Error fetching shared chat:', error);
    return c.json({
      error: 'Failed to fetch shared chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Import shared chat endpoint (requires auth)
api.post('/shared/:shareId/import', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const shareId = c.req.param('shareId');
    const db = await getDatabase();

    // Find shared chat
    const [originalChat] = await db
      .select()
      .from(schema.chats)
      .where(
        and(
          eq(schema.chats.shareId, shareId),
          eq(schema.chats.isShared, true)
        )
      );

    if (!originalChat) {
      return c.json({ error: 'Shared chat not found' }, 404);
    }

    // Check if user already imported this chat
    const [existingImport] = await db
      .select()
      .from(schema.chats)
      .where(
        and(
          eq(schema.chats.originalChatId, originalChat.id),
          eq(schema.chats.userId, user.id),
          eq(schema.chats.isShared, false) // This is an imported copy, not the original shared chat
        )
      );

    if (existingImport) {
      return c.json({
        chat: existingImport,
        message: 'Chat already imported',
      });
    }

    // Import the ChatCopyService
    const { ChatCopyService } = await import('./services/ChatCopyService');

    // Use the common ChatCopyService for copying chat and messages
    const result = await ChatCopyService.copyChat({
      userId: user.id,
      sourceChat: originalChat,
      title: ChatCopyService.generateCopiedTitle(originalChat.title, 'shared'),
      metadata: {
        originalChatId: originalChat.id,
        isShared: false, // This is an imported copy, not the original shared chat
      },
    });

    return c.json({
      chat: result.chat,
      message: 'Chat imported successfully',
    });

  } catch (error) {
    console.error('Error importing shared chat:', error);
    return c.json({
      error: 'Failed to import chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Public file endpoint for shared chats (no auth required)
api.get('/shared/:shareId/files/:fileId', async (c) => {
  try {
    const shareId = c.req.param('shareId');
    const fileId = c.req.param('fileId');
    const db = await getDatabase();

    // First, verify the share exists and is active
    const [sharedChat] = await db
      .select()
      .from(schema.chats)
      .where(
        and(
          eq(schema.chats.shareId, shareId),
          eq(schema.chats.isShared, true)
        )
      );

    if (!sharedChat) {
      return c.json({ error: 'Shared chat not found' }, 404);
    }

    // Verify the file belongs to a message in this shared chat
    const [messageWithFile] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.chatId, sharedChat.id));

    if (!messageWithFile) {
      return c.json({ error: 'File not found in shared chat' }, 404);
    }

    // Check if the file is in any of the messages' attachments
    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.chatId, sharedChat.id));

    let fileFound = false;
    for (const message of messages) {
      if (message.attachments && Array.isArray(message.attachments)) {
        const hasFile = message.attachments.some((att: any) => att.id === fileId);
        if (hasFile) {
          fileFound = true;
          break;
        }
      }
    }

    if (!fileFound) {
      return c.json({ error: 'File not found in shared chat' }, 404);
    }

    // Import the FileService to get the file
    const { FileService } = await import('./services/FileService');
    const fileService = new FileService();
    
    // Get file metadata first
    const fileRecord = await fileService.getFile(fileId);
    if (!fileRecord) {
      return c.json({ error: 'File not found' }, 404);
    }

    // Get the actual file buffer
    const fileBuffer = await fileService.getFileBuffer(fileId, c.env);
    if (!fileBuffer) {
      return c.json({ error: 'File data not available' }, 404);
    }

    // Return the file with appropriate headers
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': fileRecord.fileType || 'application/octet-stream',
        'Content-Length': fileBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });

  } catch (error) {
    console.error('Error fetching shared chat file:', error);
    return c.json({
      error: 'Failed to fetch file',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
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
chatRoutes.route('/user', userManagement);
chatRoutes.route('/images', imageGeneration);

api.route('/', chatRoutes);

// Mount the API router
app.route('/api/v1', api);

export default app; 