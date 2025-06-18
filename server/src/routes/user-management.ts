import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { getDatabase } from '../lib/db-cloudflare';
import { users, chats as chatsTable } from '../schema';
import { rateLimitMiddleware } from '../middleware/rateLimiting';

const userManagement = new Hono();

// POST /api/v1/user/pin-chat/:chatId - Pin a chat
userManagement.post('/pin-chat/:chatId', rateLimitMiddleware(30, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('chatId');
    const db = await getDatabase();

    // Verify the chat exists and belongs to the user
    const [chat] = await db
      .select()
      .from(chatsTable)
      .where(eq(chatsTable.id, chatId));

    if (!chat || chat.userId !== user.id) {
      return c.json({ error: 'Chat not found' }, 404);
    }

    // Get current user with pinned chats
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));

    if (!currentUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check if chat is already pinned
    const pinnedChats = currentUser.pinned_chats || [];
    if (pinnedChats.includes(chatId)) {
      return c.json({ 
        message: 'Chat is already pinned',
        pinnedChats 
      });
    }

    // Add chat to pinned list
    const updatedPinnedChats = [...pinnedChats, chatId];

    // Update user with new pinned chats
    const [updatedUser] = await db
      .update(users)
      .set({ 
        pinned_chats: updatedPinnedChats,
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    return c.json({ 
      message: 'Chat pinned successfully',
      pinnedChats: updatedUser.pinned_chats 
    });

  } catch (error) {
    console.error('Error pinning chat:', error);
    return c.json({
      error: 'Failed to pin chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// DELETE /api/v1/user/pin-chat/:chatId - Unpin a chat
userManagement.delete('/pin-chat/:chatId', rateLimitMiddleware(30, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('chatId');
    const db = await getDatabase();

    // Get current user with pinned chats
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));

    if (!currentUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Remove chat from pinned list
    const pinnedChats = currentUser.pinned_chats || [];
    const updatedPinnedChats = pinnedChats.filter(id => id !== chatId);

    // Update user with new pinned chats
    const [updatedUser] = await db
      .update(users)
      .set({ 
        pinned_chats: updatedPinnedChats,
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    return c.json({ 
      message: 'Chat unpinned successfully',
      pinnedChats: updatedUser.pinned_chats 
    });

  } catch (error) {
    console.error('Error unpinning chat:', error);
    return c.json({
      error: 'Failed to unpin chat',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/v1/user/pinned-chats - Get user's pinned chats
userManagement.get('/pinned-chats', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const db = await getDatabase();

    // Get current user with pinned chats
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));

    if (!currentUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ 
      pinnedChats: currentUser.pinned_chats || [] 
    });

  } catch (error) {
    console.error('Error fetching pinned chats:', error);
    return c.json({
      error: 'Failed to fetch pinned chats',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export { userManagement }; 