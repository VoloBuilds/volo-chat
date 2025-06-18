import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { getDatabase } from '../lib/db-cloudflare';
import { chats as chatsTable, messages, files } from '../schema';
import type { NewChat, NewMessage, NewFileRecord } from '../schema';
import { rateLimitMiddleware } from '../middleware/rateLimiting';
import { ChatCopyService } from '../services/ChatCopyService';

const chatSharing = new Hono();

// POST /api/v1/chats/:id/share - Generate share link for chat
chatSharing.post('/:id/share', rateLimitMiddleware(5, 300000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const db = await getDatabase();

    // Verify user owns the chat
    const [chat] = await db
      .select()
      .from(chatsTable)
      .where(
        and(
          eq(chatsTable.id, chatId),
          eq(chatsTable.userId, user.id)
        )
      );

    if (!chat) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    // If already shared, return existing share info
    if (chat.isShared && chat.shareId) {
      return c.json({
        chat,
        shareUrl: `${c.req.header('origin') || 'https://your-domain.com'}/shared/${chat.shareId}`,
      });
    }

    // Generate unique share ID
    const shareId = nanoid(12); // Short, URL-safe ID

    // Update chat with sharing info
    const [updatedChat] = await db
      .update(chatsTable)
      .set({
        isShared: true,
        shareId,
        sharedAt: new Date(),
      })
      .where(eq(chatsTable.id, chatId))
      .returning();

    return c.json({
      chat: updatedChat,
      shareUrl: `${c.req.header('origin') || 'https://your-domain.com'}/shared/${shareId}`,
    });

  } catch (error) {
    console.error('Error sharing chat:', error);
    return c.json({
      error: 'Failed to share chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// DELETE /api/v1/chats/:id/share - Revoke chat sharing
chatSharing.delete('/:id/share', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const db = await getDatabase();

    // Update chat to remove sharing
    const [updatedChat] = await db
      .update(chatsTable)
      .set({
        isShared: false,
        shareId: null,
        sharedAt: null,
      })
      .where(
        and(
          eq(chatsTable.id, chatId),
          eq(chatsTable.userId, user.id)
        )
      )
      .returning();

    if (!updatedChat) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    return c.json({ success: true });

  } catch (error) {
    console.error('Error revoking chat share:', error);
    return c.json({
      error: 'Failed to revoke share',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Note: Public GET /shared/:shareId and POST /shared/:shareId/import endpoints are handled in api.ts

export { chatSharing }; 