import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';

import { getDatabase } from '../lib/db-cloudflare';
import { chats as chatsTable, messages } from '../schema';
import type { NewChat } from '../schema';
import { rateLimitMiddleware } from '../middleware/rateLimiting';
import { chatBranching } from './chat-branching';

const chatManagement = new Hono();

// GET /api/chats - List user chats
chatManagement.get('/', async (c) => {
  try {
  const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const db = await getDatabase();
    const userChats = await db
      .select()
      .from(chatsTable)
      .where(eq(chatsTable.userId, user.id))
      .orderBy(desc(chatsTable.updatedAt));

    return c.json({ chats: userChats });
  } catch (error) {
    console.error('Error fetching chats:', error);
    return c.json({
      error: 'Failed to fetch chats',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/chats - Create new chat
chatManagement.post('/', rateLimitMiddleware(20, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { title, modelId } = body;

    if (!title || !modelId) {
      return c.json({ error: 'Title and modelId are required' }, 400);
    }

    const db = await getDatabase();
    const newChat: NewChat = {
      userId: user.id,
      title,
      modelId,
      messageCount: 0,
    };

    const [chat] = await db
      .insert(chatsTable)
      .values(newChat)
      .returning();

    return c.json({ chat }, 201);
  } catch (error) {
    console.error('Error creating chat:', error);
    return c.json({
      error: 'Failed to create chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/chats/:id - Get chat with messages
chatManagement.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const db = await getDatabase();

    // Get chat and verify ownership
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

    // Get messages for this chat
    const chatMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);

    // Process messages to ensure attachment status is correct
    const processedMessages = chatMessages.map(message => {
      if (message.attachments && Array.isArray(message.attachments)) {
        const processedAttachments = message.attachments.map((attachment: any) => {
          // If attachment has an ID and no status, assume it's uploaded
          // (since it's stored in the database, it must have been successfully processed)
          if (attachment.id && !attachment.status) {
            return {
              ...attachment,
              status: 'uploaded'
            };
          }
          return attachment;
        });
        
        return {
          ...message,
          attachments: processedAttachments
        };
      }
      return message;
    });

    return c.json({
      chat,
      messages: processedMessages,
    });
  } catch (error) {
    console.error('Error fetching chat:', error);
    return c.json({
      error: 'Failed to fetch chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// PUT /api/chats/:id - Update chat (title)
chatManagement.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const body = await c.req.json();
    const { title } = body;

    if (!title) {
      return c.json({ error: 'Title is required' }, 400);
    }

    const db = await getDatabase();

    // Verify ownership and update
    const [updatedChat] = await db
      .update(chatsTable)
      .set({ 
        title,
        updatedAt: new Date(),
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

    return c.json({ chat: updatedChat });
  } catch (error) {
    console.error('Error updating chat:', error);
    return c.json({
      error: 'Failed to update chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// DELETE /api/chats/:id - Delete chat
chatManagement.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const db = await getDatabase();

    // Delete chat (messages will be deleted due to CASCADE)
    const deletedRows = await db
      .delete(chatsTable)
      .where(
        and(
          eq(chatsTable.id, chatId),
          eq(chatsTable.userId, user.id)
        )
      );

    if (deletedRows.rowCount === 0) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return c.json({
      error: 'Failed to delete chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/chats/:id/metadata - Get chat metadata including branch info
chatManagement.get('/:id/metadata', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const db = await getDatabase();

    // Get chat and verify ownership
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

    // Get related information
    let originalChat = null;
    let branches: typeof chatsTable.$inferSelect[] = [];

    // If this is a branched chat, get original
    if (chat.originalChatId && chat.isBranched) {
      [originalChat] = await db
        .select()
        .from(chatsTable)
        .where(eq(chatsTable.id, chat.originalChatId));
    }

    // Get branches from this chat (regardless of whether this chat is itself branched)
    branches = await db
      .select()
      .from(chatsTable)
      .where(
        and(
          eq(chatsTable.originalChatId, chatId),
          eq(chatsTable.isBranched, true)
        )
      );

    return c.json({
      chat,
      originalChat,
      branches,
      isBranched: chat.isBranched,
      hasOriginal: !!originalChat,
      branchCount: branches.length,
    });

  } catch (error) {
    console.error('Error fetching chat metadata:', error);
    return c.json({
      error: 'Failed to fetch chat metadata',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Mount branching routes
chatManagement.route('/', chatBranching);

export { chatManagement }; 