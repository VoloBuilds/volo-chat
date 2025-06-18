import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { getDatabase } from '../lib/db-cloudflare';
import { users, chats as chatsTable } from '../schema';
import { rateLimitMiddleware } from '../middleware/rateLimiting';
import { UserApiKeyService } from '../services/UserApiKeyService';
import { validateApiKeyFormat } from '../utils/encryption';
import { authMiddleware } from '../middleware/auth';

const userManagement = new Hono();

// All routes require authentication
userManagement.use('*', authMiddleware);

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

// POST /api/v1/user/openrouter-key - Save user's OpenRouter API key
userManagement.post('/openrouter-key', rateLimitMiddleware(5, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return c.json({ error: 'API key is required' }, 400);
    }

    // Validate API key format
    if (!validateApiKeyFormat(apiKey)) {
      return c.json({ 
        error: 'Invalid API key format. OpenRouter keys should start with "sk-" and be properly formatted.' 
      }, 400);
    }

    // Save the encrypted API key
    await UserApiKeyService.saveUserApiKey(user.id, apiKey);

    return c.json({ 
      message: 'API key saved successfully',
      success: true 
    });

  } catch (error) {
    console.error('Error saving OpenRouter API key:', error);
    return c.json({
      error: 'Failed to save API key',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/v1/user/openrouter-key/status - Check if user has an API key and its status
userManagement.get('/openrouter-key/status', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const status = await UserApiKeyService.getApiKeyStatus(user.id);
    return c.json(status);

  } catch (error) {
    console.error('Error checking OpenRouter API key status:', error);
    return c.json({
      error: 'Failed to check API key status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// DELETE /api/v1/user/openrouter-key - Remove user's OpenRouter API key
userManagement.delete('/openrouter-key', rateLimitMiddleware(5, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await UserApiKeyService.deleteUserApiKey(user.id);

    return c.json({ 
      message: 'API key deleted successfully',
      success: true 
    });

  } catch (error) {
    console.error('Error deleting OpenRouter API key:', error);
    return c.json({
      error: 'Failed to delete API key',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/v1/user/openrouter-key/validate - Test user's OpenRouter API key
userManagement.post('/openrouter-key/validate', rateLimitMiddleware(3, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { apiKey } = body;

    // Validate provided key or stored key
    const isValid = await UserApiKeyService.validateUserApiKey(user.id, apiKey);

    return c.json({ 
      isValid,
      message: isValid ? 'API key is valid' : 'API key is invalid or not working'
    });

  } catch (error) {
    console.error('Error validating OpenRouter API key:', error);
    return c.json({
      error: 'Failed to validate API key',
      message: error instanceof Error ? error.message : 'Unknown error',
      isValid: false,
    }, 500);
  }
});

// OpenAI API Key Routes

// POST /api/v1/user/openai-key - Save user's OpenAI API key
userManagement.post('/openai-key', rateLimitMiddleware(5, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return c.json({ error: 'API key is required' }, 400);
    }

    // Validate OpenAI API key format (starts with sk-)
    if (!apiKey.startsWith('sk-')) {
      return c.json({ 
        error: 'Invalid OpenAI API key format. OpenAI keys should start with "sk-".' 
      }, 400);
    }

    // Save the encrypted API key
    await UserApiKeyService.saveOpenAIApiKey(user.id, apiKey);

    return c.json({ 
      message: 'OpenAI API key saved successfully',
      success: true 
    });

  } catch (error) {
    console.error('Error saving OpenAI API key:', error);
    return c.json({
      error: 'Failed to save OpenAI API key',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/v1/user/openai-key/status - Check if user has an OpenAI API key and its status
userManagement.get('/openai-key/status', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const status = await UserApiKeyService.getOpenAIApiKeyStatus(user.id);
    return c.json(status);

  } catch (error) {
    console.error('Error checking OpenAI API key status:', error);
    return c.json({
      error: 'Failed to check OpenAI API key status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// DELETE /api/v1/user/openai-key - Remove user's OpenAI API key
userManagement.delete('/openai-key', rateLimitMiddleware(5, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await UserApiKeyService.deleteOpenAIApiKey(user.id);

    return c.json({ 
      message: 'OpenAI API key deleted successfully',
      success: true 
    });

  } catch (error) {
    console.error('Error deleting OpenAI API key:', error);
    return c.json({
      error: 'Failed to delete OpenAI API key',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/v1/user/openai-key/validate - Test user's OpenAI API key
userManagement.post('/openai-key/validate', rateLimitMiddleware(3, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { apiKey } = body;

    // Validate provided key or stored key
    const isValid = await UserApiKeyService.validateOpenAIApiKey(user.id, apiKey);

    return c.json({ 
      isValid,
      message: isValid ? 'OpenAI API key is valid' : 'OpenAI API key is invalid or not working'
    });

  } catch (error) {
    console.error('Error validating OpenAI API key:', error);
    return c.json({
      error: 'Failed to validate OpenAI API key',
      message: error instanceof Error ? error.message : 'Unknown error',
      isValid: false,
    }, 500);
  }
});

// Custom Instructions Routes

// GET /api/v1/user/custom-instructions - Get user's custom instructions
userManagement.get('/custom-instructions', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const db = await getDatabase();

    // Get current user with custom instructions
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));

    if (!currentUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ 
      customInstructions: currentUser.customInstructions || ''
    });

  } catch (error) {
    console.error('Error fetching custom instructions:', error);
    return c.json({
      error: 'Failed to fetch custom instructions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/v1/user/custom-instructions - Save user's custom instructions
userManagement.post('/custom-instructions', rateLimitMiddleware(10, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { customInstructions } = body;

    if (typeof customInstructions !== 'string') {
      return c.json({ error: 'Custom instructions must be a string' }, 400);
    }

    // Limit length to prevent abuse
    if (customInstructions.length > 5000) {
      return c.json({ 
        error: 'Custom instructions are too long (max 5000 characters)' 
      }, 400);
    }

    const db = await getDatabase();

    // Update user with custom instructions
    const [updatedUser] = await db
      .update(users)
      .set({ 
        customInstructions: customInstructions.trim() || null,
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updatedUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ 
      message: 'Custom instructions saved successfully',
      customInstructions: updatedUser.customInstructions || ''
    });

  } catch (error) {
    console.error('Error saving custom instructions:', error);
    return c.json({
      error: 'Failed to save custom instructions',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// Upgrade anonymous user to permanent account
userManagement.post('/upgrade-account', async (c) => {
  try {
    const user = c.get('user');
    const db = await getDatabase();
    
    // Check if user is anonymous
    if (!user.isAnonymous) {
      return c.json({ 
        message: 'User is already a permanent account',
        user: user 
      });
    }
    
    // Parse the request body to get the new user info from Firebase
    const body = await c.req.json();
    const { email, displayName, photoURL } = body;
    
    if (!email) {
      return c.json({ error: 'Email is required for account upgrade' }, 400);
    }
    
    // Update the user to make them permanent
    const [updatedUser] = await db.update(users)
      .set({
        email: email,
        display_name: displayName || user.display_name,
        photo_url: photoURL || user.photo_url,
        isAnonymous: false,
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    
    if (!updatedUser) {
      throw new Error('Failed to upgrade user account');
    }
    
    return c.json({ 
      message: 'Account upgraded successfully',
      user: updatedUser 
    });
    
  } catch (error) {
    console.error('Error upgrading account:', error);
    return c.json({ 
      error: 'Failed to upgrade account',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export { userManagement }; 