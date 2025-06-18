import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';

import { getDatabase } from '../lib/db-cloudflare';
import { chats as chatsTable, messages } from '../schema';
import { ChatCopyService } from '../services/ChatCopyService';
import { rateLimitMiddleware } from '../middleware/rateLimiting';

const chatBranching = new Hono();

// POST /api/v1/chats/:id/branch - Create a branch from a specific message
chatBranching.post('/:id/branch', rateLimitMiddleware(10, 300000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const body = await c.req.json();
    const { messageId } = body;

    if (!messageId) {
      return c.json({ error: 'messageId is required' }, 400);
    }

    // Check if messageId is a temporary ID (used for optimistic updates)
    if (messageId.startsWith('temp-')) {
      return c.json({ 
        error: 'Cannot branch from temporary message',
        message: 'Please wait for the message to finish sending before branching.' 
      }, 400);
    }

    const db = await getDatabase();

    // Verify user owns the chat
    const [sourceChat] = await db
      .select()
      .from(chatsTable)
      .where(
        and(
          eq(chatsTable.id, chatId),
          eq(chatsTable.userId, user.id)
        )
      );

    if (!sourceChat) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    // Verify message exists in this chat
    const [branchMessage] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.chatId, chatId)
        )
      );

    if (!branchMessage) {
      return c.json({ error: 'Message not found in this chat' }, 404);
    }

    // Check if user already has a branch from this message
    const [existingBranch] = await db
      .select()
      .from(chatsTable)
      .where(
        and(
          eq(chatsTable.originalChatId, chatId),
          eq(chatsTable.userId, user.id),
          eq(chatsTable.branchPointMessageId, messageId),
          eq(chatsTable.isBranched, true)
        )
      );

    if (existingBranch) {
      return c.json({
        chat: existingBranch,
        message: 'Branch already exists from this message',
      });
    }

    // Generate title for branched chat
    const branchedTitle = ChatCopyService.generateCopiedTitle(sourceChat.title, 'branched');

    // Create branched chat using common service
    const result = await ChatCopyService.copyChat({
      userId: user.id,
      sourceChat,
      title: branchedTitle,
      messageLimit: {
        upToMessageId: messageId,
      },
      metadata: {
        originalChatId: chatId,
        isBranched: true,
        branchPointMessageId: messageId,
        branchedAt: new Date(),
      },
    });

    return c.json({
      chat: result.chat,
      branchPoint: {
        messageId,
        originalChatId: chatId,
      },
      message: 'Chat branched successfully',
    });

  } catch (error) {
    console.error('Error branching chat:', error);
    return c.json({
      error: 'Failed to branch chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/v1/chats/:id/branches - List all branches from this chat
chatBranching.get('/:id/branches', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const db = await getDatabase();

    // Verify user owns the chat
    const [sourceChat] = await db
      .select()
      .from(chatsTable)
      .where(
        and(
          eq(chatsTable.id, chatId),
          eq(chatsTable.userId, user.id)
        )
      );

    if (!sourceChat) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    // Get all branches from this chat
    const branches = await db
      .select()
      .from(chatsTable)
      .where(
        and(
          eq(chatsTable.originalChatId, chatId),
          eq(chatsTable.userId, user.id),
          eq(chatsTable.isBranched, true)
        )
      )
      .orderBy(chatsTable.branchedAt);

    return c.json({ branches });

  } catch (error) {
    console.error('Error fetching branches:', error);
    return c.json({
      error: 'Failed to fetch branches',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export { chatBranching }; 