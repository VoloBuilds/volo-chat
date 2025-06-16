import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';

import { getDatabase } from '../lib/db-cloudflare';
import { chats as chatsTable, messages, users, type NewMessage, type NewChat } from '../schema';
import { AIProviderManager } from '../services/ai/AIProviderManager';

import { FileService, type CloudflareEnv } from '../services/FileService';
import { rateLimitMiddleware } from '../middleware/rateLimiting';
import { ChatMessage } from '../types/ai';
import { v4 as uuidv4 } from 'uuid';
import { verifyFirebaseToken } from '../lib/firebase-auth';
import { getFirebaseProjectId } from '../lib/env';
import { titleGenerator } from '../utils/titleGenerator';

const chats = new Hono();
const aiManager = new AIProviderManager();
const fileService = new FileService();

// ==============================================
// CHAT MANAGEMENT ENDPOINTS
// ==============================================

// GET /api/chats - List user chats
chats.get('/', async (c) => {
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
chats.post('/', rateLimitMiddleware(20, 60000), async (c) => {
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
chats.get('/:id', async (c) => {
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
chats.put('/:id', async (c) => {
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
chats.delete('/:id', async (c) => {
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

// ==============================================
// CHAT MESSAGING ENDPOINTS
// ==============================================

// POST /api/chats/:id/send - Send message to AI model
chats.post('/:id/send', rateLimitMiddleware(30, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const body = await c.req.json();
    const { content, modelId, attachments = [] } = body;

    if (!content || !modelId) {
      return c.json({ 
        error: 'content and modelId are required' 
      }, 400);
    }

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

    // Process attachments - use base64 for AI but also commit to R2 for persistence
    let processedAttachments = attachments;
    if (attachments && attachments.length > 0) {
      console.log(`[CHAT-SEND] Processing ${attachments.length} attachments (hybrid approach):`, attachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        fileType: att.fileType
      })));

      // Commit files to R2 for persistence (user can view later)
      const fileIds = attachments.map((att: any) => att.id);
      console.log(`[CHAT-SEND] Committing files to R2 for persistence:`, fileIds);
      await fileService.commitFilesToR2(fileIds, c.env as CloudflareEnv);
      
      // Update attachments with R2 URLs but we'll still use base64 for AI
      processedAttachments = await Promise.all(
        attachments.map(async (att: any) => {
          const fileRecord = await fileService.getFile(att.id);
          if (fileRecord) {
            console.log(`[CHAT-SEND] File ${att.id} after R2 commit:`, {
              status: fileRecord.status,
              storedPrivately: fileRecord.status === 'uploaded'
            });
            return {
              ...att,
              // No URL - files are stored privately and accessed via API
              status: fileRecord.status
            };
          }
          console.log(`[CHAT-SEND] File ${att.id} - File record not found`);
          return att;
        })
      );

      console.log(`[CHAT-SEND] Processed attachments (hybrid):`, processedAttachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        status: att.status,
        storedPrivately: att.status === 'uploaded'
      })));
    }

    // Save user message
    const userMessage: NewMessage = {
      chatId: chatId,
      role: 'user',
      content,
      attachments: processedAttachments,
    };

    const [savedUserMessage] = await db
      .insert(messages)
      .values(userMessage)
      .returning();

    // Get chat history for AI context
    const chatHistory = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);

    // Convert to AI format
    console.log(`[CHAT-SEND] Converting ${chatHistory.length} messages to AI format`);
    const aiMessages: ChatMessage[] = await Promise.all(
      chatHistory.map(async (msg) => {
        let attachments;
        
        if (msg.attachments && msg.attachments.length > 0) {
          console.log(`[CHAT-SEND] Message ${msg.id} has ${msg.attachments.length} attachments`);
          attachments = await Promise.all(
            msg.attachments.map(async (att: any) => {
              console.log(`[CHAT-SEND] Processing attachment ${att.id} for AI:`, {
                filename: att.filename,
                fileType: att.fileType
              });
              
              if (att.fileType.startsWith('image/')) {
                // Get file record to access R2 URL
                const fileRecord = await fileService.getFile(att.id);
                
                if (!fileRecord) {
                  console.warn(`File record not found for ${att.id}`);
                  return {
                    type: 'text' as const,
                    data: `[Image: ${att.filename}] - File not found`,
                    mimeType: 'text/plain',
                  };
                }

                // Try to get R2 URL for AI processing
                const r2Url = fileService.getFileUrlForAI(fileRecord);
                if (r2Url) {
                  return {
                    type: 'image' as const,
                    data: r2Url,
                    mimeType: att.fileType,
                  };
                }

                // No R2 URL available - image not accessible for AI
                console.warn(`Image ${att.id} not accessible for AI processing - not uploaded to R2`);
                return {
                  type: 'text' as const,
                  data: `[Image: ${att.filename}] - Not yet uploaded to storage`,
                  mimeType: 'text/plain',
                };
              } else {
                // Handle non-image files
                const fileRecord = await fileService.getFile(att.id);
                const r2Url = fileRecord ? fileService.getFileUrlForAI(fileRecord) : null;
                
                return {
                  type: 'text' as const,
                  data: r2Url || att.url || `[File: ${att.filename}]`,
                  mimeType: att.fileType,
                };
              }
            })
          );
        }

        return {
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          attachments,
        };
      })
    );

    // Get AI response
    const aiResponse = await aiManager.sendMessage(modelId, aiMessages);

    // Save AI response
    const assistantMessage: NewMessage = {
      chatId: chatId,
      role: 'assistant',
      content: aiResponse,
      modelId,
    };

    const [savedAssistantMessage] = await db
      .insert(messages)
      .values(assistantMessage)
      .returning();

    // Update chat
    await db
      .update(chatsTable)
      .set({ 
        messageCount: chatHistory.length + 2, // +2 for user and assistant messages
        updatedAt: new Date(),
      })
      .where(eq(chatsTable.id, chatId));

    return c.json({
      userMessage: savedUserMessage,
      assistantMessage: savedAssistantMessage,
    });

  } catch (error) {
    console.error('Chat send error:', error);
    return c.json({
      error: 'Failed to send message',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/chats/:id/generate-title - Generate chat title using AI
chats.post('/:id/generate-title', rateLimitMiddleware(10, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const body = await c.req.json();
    const { content, modelId } = body;

    if (!content) {
      return c.json({ error: 'content is required' }, 400);
    }

    // Verify user owns the chat
    const db = await getDatabase();
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

    // Use the title generator utility
    const result = await titleGenerator.generateTitle({
      content,
      modelId, // Will use default 'gemini-2.5-flash-preview-05-20' if not provided
    });

    // Add debug information in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Title generation result:', {
        input: content.substring(0, 100) + '...',
        output: result.title,
        source: result.source,
      });
    }

    return c.json(result);

  } catch (error) {
    console.error('Title generation error:', error);
    return c.json({
      error: 'Failed to generate title',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});



// POST /api/chats/:id/stream-http - HTTP-based streaming
chats.post('/:id/stream-http', rateLimitMiddleware(30, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const body = await c.req.json();
    const { content, modelId, attachments = [] } = body;

    if (!content || !modelId) {
      return c.json({ 
        error: 'content and modelId are required' 
      }, 400);
    }

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

    console.log(`[HTTP-STREAM] Starting streaming for chat ${chatId}, user ${user.id}, model ${modelId}`);

    // Process attachments for streaming
    let processedAttachments = attachments;
    if (attachments && attachments.length > 0) {
      console.log(`[HTTP-STREAM] Processing ${attachments.length} attachments`);
      
      // Commit files to R2 for persistence
      const fileIds = attachments.map((att: any) => att.id);
      await fileService.commitFilesToR2(fileIds, c.env as CloudflareEnv);
      
      processedAttachments = await Promise.all(
        attachments.map(async (att: any) => {
          const fileRecord = await fileService.getFile(att.id);
          return fileRecord ? { ...att, status: fileRecord.status } : att;
        })
      );
    }

    // Save user message
    const userMessage: NewMessage = {
      chatId: chatId,
      role: 'user',
      content,
      attachments: processedAttachments,
    };

    const [savedUserMessage] = await db
      .insert(messages)
      .values(userMessage)
      .returning();

    console.log(`[HTTP-STREAM] Saved user message ${savedUserMessage.id}`);

    // Get chat history
    const chatHistory = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);

    // Convert to AI format for streaming
    const aiMessages: ChatMessage[] = await Promise.all(
      chatHistory.map(async (msg) => {
        let attachments;
        
        if (msg.attachments && msg.attachments.length > 0) {
          attachments = await Promise.all(
            msg.attachments.map(async (att: any) => {
              if (att.fileType.startsWith('image/')) {
                const fileRecord = await fileService.getFile(att.id);
                if (!fileRecord) {
                  return {
                    type: 'text' as const,
                    data: `[Image: ${att.filename}] - File not found`,
                    mimeType: 'text/plain',
                  };
                }

                const r2Url = fileService.getFileUrlForAI(fileRecord);
                if (r2Url) {
                  return {
                    type: 'image' as const,
                    data: r2Url,
                    mimeType: att.fileType,
                  };
                }

                return {
                  type: 'text' as const,
                  data: `[Image: ${att.filename}] - Not yet uploaded to storage`,
                  mimeType: 'text/plain',
                };
              } else {
                const fileRecord = await fileService.getFile(att.id);
                const r2Url = fileRecord ? fileService.getFileUrlForAI(fileRecord) : null;
                
                return {
                  type: 'text' as const,
                  data: r2Url || att.url || `[File: ${att.filename}]`,
                  mimeType: att.fileType,
                };
              }
            })
          );
        }

        return {
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          attachments,
        };
      })
    );

    // Set up streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          // Send initial user message confirmation
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'user_message',
              message: savedUserMessage
            })}\n\n`)
          );

          let assistantContent = '';
          
          // Stream AI response
          const aiStream = await aiManager.streamMessage(modelId, aiMessages);
          
          for await (const chunk of aiStream) {
            assistantContent += chunk;
            
            // Send chunk to client
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'stream_chunk',
                chunk: chunk
              })}\n\n`)
            );
          }

          // Save complete assistant message
          const assistantMessage: NewMessage = {
            chatId: chatId,
            role: 'assistant',
            content: assistantContent,
            modelId,
          };

          const [savedAssistantMessage] = await db
            .insert(messages)
            .values(assistantMessage)
            .returning();

          console.log(`[HTTP-STREAM] Saved assistant message ${savedAssistantMessage.id}, length: ${assistantContent.length}`);

          // Update chat
          await db
            .update(chatsTable)
            .set({ 
              messageCount: chatHistory.length + 2,
              updatedAt: new Date(),
            })
            .where(eq(chatsTable.id, chatId));

          // Send completion
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'stream_end',
              message: savedAssistantMessage
            })}\n\n`)
          );

        } catch (error) {
          console.error('[HTTP-STREAM] Error:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'stream_error',
              error: error instanceof Error ? error.message : 'Unknown error'
            })}\n\n`)
          );
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

  } catch (error) {
    console.error('HTTP streaming error:', error);
    return c.json({
      error: 'Failed to start streaming',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export { chats }; 