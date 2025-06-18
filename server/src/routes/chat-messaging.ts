import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';

import { getDatabase } from '../lib/db-cloudflare';
import { chats as chatsTable, messages, type NewMessage } from '../schema';
import { AIProviderManager } from '../services/ai/AIProviderManager';
import { FileService, type CloudflareEnv } from '../services/FileService';
import { rateLimitMiddleware } from '../middleware/rateLimiting';
import { ChatMessage } from '../types/ai';
import { titleGenerator } from '../utils/titleGenerator';
import { ModelMappings } from '../services/ai/ModelMappings';

// Helper function to check if a file type is text-based
function isTextBasedFile(mimeType?: string): boolean {
  if (!mimeType) return false;
  
  const textBasedTypes = [
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv',
    'text/rtf',
    'application/rtf'
  ];
  
  return textBasedTypes.includes(mimeType) || mimeType.startsWith('text/');
}

const chatMessaging = new Hono();
const aiManager = new AIProviderManager();
const fileService = new FileService();

// POST /api/chats/:id/send - Send message to AI model
chatMessaging.post('/:id/send', rateLimitMiddleware(30, 60000), async (c) => {
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

    // Determine if we're using OpenRouter for this model
    const usingOpenRouter = ModelMappings.shouldUseOpenRouter(modelId);
    console.log(`[CHAT-SEND] Model ${modelId} will use OpenRouter: ${usingOpenRouter}`);

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
                fileType: att.fileType,
                usingOpenRouter
              });
              
              if (att.fileType.startsWith('image/')) {
                // Get file record to access image data
                const fileRecord = await fileService.getFile(att.id);
                
                if (!fileRecord) {
                  console.warn(`File record not found for ${att.id}`);
                  return {
                    type: 'text' as const,
                    data: `[Image: ${att.filename}] - File not found`,
                    mimeType: 'text/plain',
                  };
                }

                if (usingOpenRouter) {
                  // OpenRouter needs base64 data URLs for most models
                  console.log(`[CHAT-SEND] Getting base64 data for OpenRouter: ${att.id}`);
                  const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                  if (base64Data) {
                    return {
                      type: 'image' as const,
                      data: base64Data,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`Image ${att.id} could not be converted to base64 for OpenRouter`);
                } else {
                  // Direct providers can use R2 URLs
                  console.log(`[CHAT-SEND] Getting R2 URL for direct provider: ${att.id}`);
                  const r2Url = fileService.getFileUrlForAI(fileRecord);
                  if (r2Url) {
                    return {
                      type: 'image' as const,
                      data: r2Url,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`Image ${att.id} not accessible - not uploaded to R2`);
                }

                // Fallback if no image data available
                return {
                  type: 'text' as const,
                  data: `[Image: ${att.filename}] - Not accessible for AI processing`,
                  mimeType: 'text/plain',
                };
              } else {
                // Handle non-image files (PDFs, documents, text files, etc.)
                const fileRecord = await fileService.getFile(att.id);
                
                if (!fileRecord) {
                  console.warn(`File record not found for ${att.id}`);
                  return {
                    type: 'text' as const,
                    data: `[File: ${att.filename}] - File not found`,
                    mimeType: 'text/plain',
                  };
                }

                // Check if this is a text-based file that we can process inline
                const isTextBased = isTextBasedFile(att.fileType);
                
                if (usingOpenRouter) {
                  if (att.fileType === 'application/pdf') {
                    // OpenRouter supports PDF files as base64
                    console.log(`[CHAT-SEND] Getting base64 PDF for OpenRouter: ${att.id}`);
                    const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                    if (base64Data) {
                      return {
                        type: 'pdf' as const,
                        data: base64Data,
                        mimeType: att.fileType,
                      };
                    }
                    console.warn(`PDF ${att.id} could not be converted to base64 for OpenRouter`);
                  } else if (isTextBased) {
                    // For text-based files, get the content as base64 and let OpenRouter process it
                    console.log(`[CHAT-SEND] Getting base64 text file for OpenRouter: ${att.id}`);
                    const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                    if (base64Data) {
                      return {
                        type: 'text' as const,
                        data: base64Data,
                        mimeType: att.fileType,
                      };
                    }
                    console.warn(`Text file ${att.id} could not be converted to base64 for OpenRouter`);
                  }
                } else {
                  // For direct providers, try R2 URL
                  console.log(`[CHAT-SEND] Getting R2 URL for file: ${att.id}`);
                  const r2Url = fileService.getFileUrlForAI(fileRecord);
                  if (r2Url) {
                    // Determine the attachment type based on file type
                    let attachmentType: 'pdf' | 'text' = 'text';
                    if (att.fileType === 'application/pdf') {
                      attachmentType = 'pdf';
                    }

                    return {
                      type: attachmentType,
                      data: r2Url,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`File ${att.id} not accessible - not uploaded to R2`);
                }

                // Fallback if no file data available
                return {
                  type: 'text' as const,
                  data: `[File: ${att.filename}] - Not accessible for AI processing`,
                  mimeType: 'text/plain',
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

    // Check if this is an image generation model
    let aiResponse: string;
    let messageAttachments: any[] = [];

    if (aiManager.isImageGenerationModel(modelId)) {
      // Handle image generation
      console.log(`[CHAT-SEND] Using image generation for model: ${modelId}`);
      
      try {
        const imageResult = await aiManager.generateImage(modelId, content, {
          size: '1024x1024',
          partial_images: 2
        }, user.id);
        
        // Create attachment for the generated image
        if (imageResult.url) {
          messageAttachments = [{
            id: imageResult.id,
            filename: `generated-image-${Date.now()}.png`,
            fileType: 'image/png',
            fileSize: 0, // Unknown size from URL
            url: imageResult.url,
            status: 'uploaded',
            type: 'image'
          }];
        }
        
        // Create response text
        aiResponse = imageResult.revised_prompt 
          ? `I generated an image based on your prompt. The refined prompt was: "${imageResult.revised_prompt}"`
          : 'I generated an image based on your prompt.';
          
      } catch (error) {
        console.error('Image generation failed:', error);
        aiResponse = `I'm sorry, I couldn't generate an image. ${error instanceof Error ? error.message : 'Please try again.'}`;
      }
    } else {
      // Handle regular text generation
      aiResponse = await aiManager.sendMessage(modelId, aiMessages, user.id);
    }

    // Save AI response
    const assistantMessage: NewMessage = {
      chatId: chatId,
      role: 'assistant',
      content: aiResponse,
      modelId,
      attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
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
chatMessaging.post('/:id/generate-title', rateLimitMiddleware(10, 60000), async (c) => {
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
      userId: user.id, // Pass user ID for BYOK support
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
chatMessaging.post('/:id/stream-http', rateLimitMiddleware(30, 60000), async (c) => {
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

    // Process attachments for streaming (only commit if files are still pending)
    let processedAttachments = attachments;
    if (attachments && attachments.length > 0) {
      console.log(`[HTTP-STREAM] Processing ${attachments.length} attachments`);
      
      // Check which files are still pending before committing
      const pendingFileIds: string[] = [];
      for (const att of attachments) {
        const fileRecord = await fileService.getFile(att.id);
        if (fileRecord && fileRecord.status === 'pending') {
          pendingFileIds.push(att.id);
        }
      }
      
      // Only commit pending files to R2
      if (pendingFileIds.length > 0) {
        console.log(`[HTTP-STREAM] Committing ${pendingFileIds.length} pending files to R2`);
        await fileService.commitFilesToR2(pendingFileIds, c.env as CloudflareEnv);
      } else {
        console.log(`[HTTP-STREAM] All files already committed to R2, skipping commit`);
      }
      
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

    // Determine if we're using OpenRouter for this model
    const usingOpenRouter = ModelMappings.shouldUseOpenRouter(modelId);
    console.log(`[HTTP-STREAM] Model ${modelId} will use OpenRouter: ${usingOpenRouter}`);

    // Convert to AI format for streaming (with OpenRouter base64 support)
    const aiMessages: ChatMessage[] = await Promise.all(
      chatHistory.map(async (msg) => {
        let attachments;
        
        if (msg.attachments && msg.attachments.length > 0) {
          console.log(`[HTTP-STREAM] Message ${msg.id} has ${msg.attachments.length} attachments`);
          attachments = await Promise.all(
            msg.attachments.map(async (att: any) => {
              console.log(`[HTTP-STREAM] Processing attachment ${att.id} for AI:`, {
                filename: att.filename,
                fileType: att.fileType,
                usingOpenRouter
              });
              
              if (att.fileType.startsWith('image/')) {
                // Get file record to access image data
                const fileRecord = await fileService.getFile(att.id);
                
                if (!fileRecord) {
                  console.warn(`File record not found for ${att.id}`);
                  return {
                    type: 'text' as const,
                    data: `[Image: ${att.filename}] - File not found`,
                    mimeType: 'text/plain',
                  };
                }

                if (usingOpenRouter) {
                  // OpenRouter needs base64 data URLs for most models
                  console.log(`[HTTP-STREAM] Getting base64 data for OpenRouter: ${att.id}`);
                  const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                  if (base64Data) {
                    return {
                      type: 'image' as const,
                      data: base64Data,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`Image ${att.id} could not be converted to base64 for OpenRouter`);
                } else {
                  // Direct providers can use R2 URLs
                  console.log(`[HTTP-STREAM] Getting R2 URL for direct provider: ${att.id}`);
                  const r2Url = fileService.getFileUrlForAI(fileRecord);
                  if (r2Url) {
                    return {
                      type: 'image' as const,
                      data: r2Url,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`Image ${att.id} not accessible - not uploaded to R2`);
                }

                // Fallback if no image data available
                return {
                  type: 'text' as const,
                  data: `[Image: ${att.filename}] - Not accessible for AI processing`,
                  mimeType: 'text/plain',
                };
              } else {
                // Handle non-image files (PDFs, documents, text files, etc.)
                const fileRecord = await fileService.getFile(att.id);
                
                if (!fileRecord) {
                  console.warn(`File record not found for ${att.id}`);
                  return {
                    type: 'text' as const,
                    data: `[File: ${att.filename}] - File not found`,
                    mimeType: 'text/plain',
                  };
                }

                // Check if this is a text-based file that we can process inline
                const isTextBased = isTextBasedFile(att.fileType);
                
                if (usingOpenRouter) {
                  if (att.fileType === 'application/pdf') {
                    // OpenRouter supports PDF files as base64
                    console.log(`[HTTP-STREAM] Getting base64 PDF for OpenRouter: ${att.id}`);
                    const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                    if (base64Data) {
                      return {
                        type: 'pdf' as const,
                        data: base64Data,
                        mimeType: att.fileType,
                      };
                    }
                    console.warn(`PDF ${att.id} could not be converted to base64 for OpenRouter`);
                  } else if (isTextBased) {
                    // For text-based files, get the content as base64 and let OpenRouter process it
                    console.log(`[HTTP-STREAM] Getting base64 text file for OpenRouter: ${att.id}`);
                    const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                    if (base64Data) {
                      return {
                        type: 'text' as const,
                        data: base64Data,
                        mimeType: att.fileType,
                      };
                    }
                    console.warn(`Text file ${att.id} could not be converted to base64 for OpenRouter`);
                  }
                } else {
                  // For direct providers, try R2 URL
                  console.log(`[HTTP-STREAM] Getting R2 URL for file: ${att.id}`);
                  const r2Url = fileService.getFileUrlForAI(fileRecord);
                  if (r2Url) {
                    // Determine the attachment type based on file type
                    let attachmentType: 'pdf' | 'text' = 'text';
                    if (att.fileType === 'application/pdf') {
                      attachmentType = 'pdf';
                    }

                    return {
                      type: attachmentType,
                      data: r2Url,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`File ${att.id} not accessible - not uploaded to R2`);
                }

                // Fallback if no file data available
                return {
                  type: 'text' as const,
                  data: `[File: ${att.filename}] - Not accessible for AI processing`,
                  mimeType: 'text/plain',
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

    // Image generation models now support streaming with partial images
    const isImageModel = aiManager.isImageGenerationModel(modelId);
    if (isImageModel) {
      console.log(`[HTTP-STREAM] Image generation model detected: ${modelId}, using streaming with partial images`);
    }

    // Set up streaming response with cancellation support
    let isCancelled = false;
    let partialContent = '';
    
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
          
          // Stream AI response (pass user ID for BYOK support)
          const aiStream = await aiManager.streamMessage(modelId, aiMessages, user.id);
          
          for await (const chunk of aiStream) {
            // Check for cancellation before processing each chunk
            if (isCancelled) {
              console.log('[HTTP-STREAM] Stream cancelled by client');
              break;
            }
            
            assistantContent += chunk;
            partialContent = assistantContent; // Track partial content for cancellation
            
            // Send chunk to client
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'stream_chunk',
                chunk: chunk
              })}\n\n`)
            );
          }

          // Save complete or partial assistant message (in case of cancellation)
          const finalContent = isCancelled ? partialContent : assistantContent;
          const assistantMessage: NewMessage = {
            chatId: chatId,
            role: 'assistant',
            content: finalContent,
            modelId,
          };

          const [savedAssistantMessage] = await db
            .insert(messages)
            .values(assistantMessage)
            .returning();

          console.log(`[HTTP-STREAM] Saved assistant message ${savedAssistantMessage.id}, length: ${finalContent.length}, cancelled: ${isCancelled}`);

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
              type: isCancelled ? 'stream_cancelled' : 'stream_end',
              message: savedAssistantMessage,
              cancelled: isCancelled
            })}\n\n`)
          );

        } catch (error) {
          console.error('[HTTP-STREAM] Error:', error);
          console.error('[HTTP-STREAM] Error type:', typeof error);
          console.error('[HTTP-STREAM] Error constructor:', error?.constructor?.name);
          console.error('[HTTP-STREAM] Error properties:', Object.getOwnPropertyNames(error));
          
          // Extract error details for better client-side handling
          const isProviderError = error && typeof error === 'object' && 'provider' in error;
          const statusCode = isProviderError ? (error as any).statusCode : undefined;
          const provider = isProviderError ? (error as any).provider : 'unknown';
          const retryable = isProviderError ? (error as any).retryable : false;
          
          // Try multiple ways to extract the error message
          let errorMessage = 'Unknown error';
          
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          
          // For ProviderError objects, try the message property directly
          if (isProviderError && (error as any).message) {
            errorMessage = (error as any).message;
          }
          
          // Also try other common error properties
          if (errorMessage === 'Unknown error' && error && typeof error === 'object') {
            const err = error as any;
            if (typeof err.message === 'string' && err.message !== 'Unknown error') {
              errorMessage = err.message;
            } else if (typeof err.error === 'string') {
              errorMessage = err.error;
            } else if (err.error?.message) {
              errorMessage = err.error.message;
            }
          }
          
          // Log the raw error message for debugging
          console.log('[HTTP-STREAM] Raw error message:', JSON.stringify(errorMessage));
          console.log('[HTTP-STREAM] Error details:', { statusCode, provider, retryable, isProviderError });
          
          // Create the error object to be JSON encoded
          const errorData = {
            type: 'stream_error',
            error: errorMessage,
            statusCode: statusCode,
            provider: provider,
            retryable: retryable
          };
          
          // Log the error data being sent
          console.log('[HTTP-STREAM] Sending error data:', JSON.stringify(errorData));
          
          // Save the error message as the assistant's response to the database
          try {
            const assistantErrorMessage: NewMessage = {
              chatId: chatId,
              role: 'assistant',
              content: errorMessage,
              modelId,
            };

            const [savedAssistantMessage] = await db
              .insert(messages)
              .values(assistantErrorMessage)
              .returning();

            console.log(`[HTTP-STREAM] Saved error message as assistant response ${savedAssistantMessage.id}`);

            // Update chat message count
            await db
              .update(chatsTable)
              .set({ 
                messageCount: chatHistory.length + 2, // user + assistant (error) message
                updatedAt: new Date(),
              })
              .where(eq(chatsTable.id, chatId));

            console.log('[HTTP-STREAM] Updated chat message count after error');
          } catch (dbError) {
            console.error('[HTTP-STREAM] Failed to save error message to database:', dbError);
          }
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
      
      // Handle cancellation from the client side
      cancel() {
        console.log('[HTTP-STREAM] Stream cancelled by client disconnect');
        isCancelled = true;
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

// POST /api/chats/:id/cancel-stream - Cancel an ongoing stream and save partial content
chatMessaging.post('/:id/cancel-stream', rateLimitMiddleware(30, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const body = await c.req.json();
    const { partialContent, modelId } = body;

    if (!partialContent || !modelId) {
      return c.json({ 
        error: 'partialContent and modelId are required' 
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

    console.log(`[CANCEL-STREAM] Saving partial content for chat ${chatId}:`, {
      length: partialContent.length,
      preview: partialContent.substring(0, 100) + '...'
    });

    // Save the partial assistant message
    const assistantMessage: NewMessage = {
      chatId: chatId,
      role: 'assistant',
      content: partialContent,
      modelId,
    };

    const [savedAssistantMessage] = await db
      .insert(messages)
      .values(assistantMessage)
      .returning();

    // Get the current message count for chat update
    const chatHistory = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId));

    // Update chat
    await db
      .update(chatsTable)
      .set({ 
        messageCount: chatHistory.length,
        updatedAt: new Date(),
      })
      .where(eq(chatsTable.id, chatId));

    console.log(`[CANCEL-STREAM] Saved cancelled message ${savedAssistantMessage.id} with ${partialContent.length} characters`);

    return c.json({
      message: savedAssistantMessage,
      cancelled: true
    });

  } catch (error) {
    console.error('Cancel stream error:', error);
    return c.json({
      error: 'Failed to cancel stream',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/chats/:id/messages/:messageId/retry - Retry AI message generation
chatMessaging.post('/:id/messages/:messageId/retry', rateLimitMiddleware(30, 60000), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const chatId = c.req.param('id');
    const messageId = c.req.param('messageId');

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

    // Get the message to retry - must be an assistant message
    const [messageToRetry] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.chatId, chatId),
          eq(messages.role, 'assistant')
        )
      );

    if (!messageToRetry) {
      return c.json({ error: 'Message not found or not an assistant message' }, 404);
    }

    console.log(`[RETRY] Retrying message ${messageId} in chat ${chatId}`);

    // Get chat history up to (but not including) the message to retry
    const chatHistory = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId)
        )
      )
      .orderBy(messages.createdAt);

    // Filter out messages created after the retry message in memory
    const messageToRetryCreatedAt = messageToRetry.createdAt;
    const filteredHistory = chatHistory.filter(msg => msg.createdAt < messageToRetryCreatedAt);

    console.log(`[RETRY] Got ${filteredHistory.length} messages in history before retry message`);

    // Delete the message to retry
    await db
      .delete(messages)
      .where(eq(messages.id, messageId));

    console.log(`[RETRY] Deleted message ${messageId}`);

    // Get the model ID from the deleted message
    const modelId = messageToRetry.modelId;
    if (!modelId) {
      return c.json({ error: 'No model ID found in the message to retry' }, 400);
    }

    // Determine if we're using OpenRouter for this model
    const usingOpenRouter = ModelMappings.shouldUseOpenRouter(modelId);
    console.log(`[RETRY] Model ${modelId} will use OpenRouter: ${usingOpenRouter}`);

    // Convert history to AI format
    console.log(`[RETRY] Converting ${filteredHistory.length} messages to AI format`);
    const aiMessages: ChatMessage[] = await Promise.all(
      filteredHistory.map(async (msg) => {
        let attachments;
        
        if (msg.attachments && msg.attachments.length > 0) {
          console.log(`[RETRY] Message ${msg.id} has ${msg.attachments.length} attachments`);
          attachments = await Promise.all(
            msg.attachments.map(async (att: any) => {
              console.log(`[RETRY] Processing attachment ${att.id} for AI:`, {
                filename: att.filename,
                fileType: att.fileType,
                usingOpenRouter
              });
              
              if (att.fileType.startsWith('image/')) {
                // Get file record to access image data
                const fileRecord = await fileService.getFile(att.id);
                
                if (!fileRecord) {
                  console.warn(`File record not found for ${att.id}`);
                  return {
                    type: 'text' as const,
                    data: `[Image: ${att.filename}] - File not found`,
                    mimeType: 'text/plain',
                  };
                }

                if (usingOpenRouter) {
                  // OpenRouter needs base64 data URLs for most models
                  console.log(`[RETRY] Getting base64 data for OpenRouter: ${att.id}`);
                  const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                  if (base64Data) {
                    return {
                      type: 'image' as const,
                      data: base64Data,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`Image ${att.id} could not be converted to base64 for OpenRouter`);
                } else {
                  // Direct providers can use R2 URLs
                  console.log(`[RETRY] Getting R2 URL for direct provider: ${att.id}`);
                  const r2Url = fileService.getFileUrlForAI(fileRecord);
                  if (r2Url) {
                    return {
                      type: 'image' as const,
                      data: r2Url,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`Image ${att.id} not accessible - not uploaded to R2`);
                }

                // Fallback if no image data available
                return {
                  type: 'text' as const,
                  data: `[Image: ${att.filename}] - Not accessible for AI processing`,
                  mimeType: 'text/plain',
                };
              } else {
                // Handle non-image files (PDFs, documents, text files, etc.)
                const fileRecord = await fileService.getFile(att.id);
                
                if (!fileRecord) {
                  console.warn(`File record not found for ${att.id}`);
                  return {
                    type: 'text' as const,
                    data: `[File: ${att.filename}] - File not found`,
                    mimeType: 'text/plain',
                  };
                }

                // Check if this is a text-based file that we can process inline
                const isTextBased = isTextBasedFile(att.fileType);
                
                if (usingOpenRouter) {
                  if (att.fileType === 'application/pdf') {
                    // OpenRouter supports PDF files as base64
                    console.log(`[RETRY] Getting base64 PDF for OpenRouter: ${att.id}`);
                    const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                    if (base64Data) {
                      return {
                        type: 'pdf' as const,
                        data: base64Data,
                        mimeType: att.fileType,
                      };
                    }
                    console.warn(`PDF ${att.id} could not be converted to base64 for OpenRouter`);
                  } else if (isTextBased) {
                    // For text-based files, get the content as base64 and let OpenRouter process it
                    console.log(`[RETRY] Getting base64 text file for OpenRouter: ${att.id}`);
                    const base64Data = await fileService.getFileAsBase64ForOpenRouter(fileRecord, c.env as CloudflareEnv);
                    if (base64Data) {
                      return {
                        type: 'text' as const,
                        data: base64Data,
                        mimeType: att.fileType,
                      };
                    }
                    console.warn(`Text file ${att.id} could not be converted to base64 for OpenRouter`);
                  }
                } else {
                  // For direct providers, try R2 URL
                  console.log(`[RETRY] Getting R2 URL for file: ${att.id}`);
                  const r2Url = fileService.getFileUrlForAI(fileRecord);
                  if (r2Url) {
                    // Determine the attachment type based on file type
                    let attachmentType: 'pdf' | 'text' = 'text';
                    if (att.fileType === 'application/pdf') {
                      attachmentType = 'pdf';
                    }

                    return {
                      type: attachmentType,
                      data: r2Url,
                      mimeType: att.fileType,
                    };
                  }
                  console.warn(`File ${att.id} not accessible - not uploaded to R2`);
                }

                // Fallback if no file data available
                return {
                  type: 'text' as const,
                  data: `[File: ${att.filename}] - Not accessible for AI processing`,
                  mimeType: 'text/plain',
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

    // Check if this is an image generation model - image generation doesn't support streaming
    if (aiManager.isImageGenerationModel(modelId)) {
      console.log(`[RETRY] Image generation model detected: ${modelId}, using non-streaming approach`);
      
      // For image generation, use non-streaming approach
      try {
        // Get the last user message to use as the prompt
        const lastUserMessage = filteredHistory.reverse().find((msg: any) => msg.role === 'user');
        if (!lastUserMessage) {
          return c.json({ error: 'No user message found to retry image generation' }, 400);
        }

        const imageResult = await aiManager.generateImage(modelId, lastUserMessage.content, {
          size: '1024x1024',
          partial_images: 2,
        }, user.id);
        
        // Create attachment for the generated image
        let messageAttachments: any[] = [];
        if (imageResult.url) {
          messageAttachments = [{
            id: imageResult.id,
            filename: `generated-image-${Date.now()}.png`,
            fileType: 'image/png',
            fileSize: 0, // Unknown size from URL
            url: imageResult.url,
            status: 'uploaded',
            type: 'image'
          }];
        }
        
        // Create response text
        const aiResponse = imageResult.revised_prompt 
          ? `I generated an image based on your prompt. The refined prompt was: "${imageResult.revised_prompt}"`
          : 'I generated an image based on your prompt.';
          
        // Save the new AI response
        const assistantMessage: NewMessage = {
          chatId: chatId,
          role: 'assistant',
          content: aiResponse,
          modelId,
          attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
        };

        const [savedAssistantMessage] = await db
          .insert(messages)
          .values(assistantMessage)
          .returning();

        // Update chat message count
        const updatedChatHistory = await db
          .select()
          .from(messages)
          .where(eq(messages.chatId, chatId));

        await db
          .update(chatsTable)
          .set({ 
            messageCount: updatedChatHistory.length,
            updatedAt: new Date(),
          })
          .where(eq(chatsTable.id, chatId));

        return c.json({
          message: savedAssistantMessage,
          type: 'image_generation'
        });

      } catch (error) {
        console.error('Image generation retry failed:', error);
        
        // Save error message as response
        const errorResponse = `I'm sorry, I couldn't generate an image. ${error instanceof Error ? error.message : 'Please try again.'}`;
        const assistantMessage: NewMessage = {
          chatId: chatId,
          role: 'assistant',
          content: errorResponse,
          modelId,
        };

        const [savedAssistantMessage] = await db
          .insert(messages)
          .values(assistantMessage)
          .returning();

        return c.json({
          message: savedAssistantMessage,
          type: 'image_generation_error'
        });
      }
    }

    // For text generation, set up streaming response
    let isCancelled = false;
    let partialContent = '';
    
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          let assistantContent = '';
          
          // Stream AI response (pass user ID for BYOK support)
          const aiStream = await aiManager.streamMessage(modelId, aiMessages, user.id);
          
          for await (const chunk of aiStream) {
            // Check for cancellation before processing each chunk
            if (isCancelled) {
              console.log('[RETRY] Stream cancelled by client');
              break;
            }
            
            assistantContent += chunk;
            partialContent = assistantContent; // Track partial content for cancellation
            
            // Send chunk to client
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'stream_chunk',
                chunk: chunk
              })}\n\n`)
            );
          }

          // Save complete or partial assistant message (in case of cancellation)
          const finalContent = isCancelled ? partialContent : assistantContent;
          const assistantMessage: NewMessage = {
            chatId: chatId,
            role: 'assistant',
            content: finalContent,
            modelId,
          };

          const [savedAssistantMessage] = await db
            .insert(messages)
            .values(assistantMessage)
            .returning();

          console.log(`[RETRY] Saved new assistant message ${savedAssistantMessage.id}, length: ${finalContent.length}, cancelled: ${isCancelled}`);

          // Update chat message count
          const updatedChatHistory = await db
            .select()
            .from(messages)
            .where(eq(messages.chatId, chatId));

          await db
            .update(chatsTable)
            .set({ 
              messageCount: updatedChatHistory.length,
              updatedAt: new Date(),
            })
            .where(eq(chatsTable.id, chatId));

          // Send completion
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: isCancelled ? 'stream_cancelled' : 'stream_end',
              message: savedAssistantMessage,
              cancelled: isCancelled
            })}\n\n`)
          );

        } catch (error) {
          console.error('[RETRY] Error:', error);
          
          // Extract error details for better client-side handling
          const isProviderError = error && typeof error === 'object' && 'provider' in error;
          const statusCode = isProviderError ? (error as any).statusCode : undefined;
          const provider = isProviderError ? (error as any).provider : 'unknown';
          const retryable = isProviderError ? (error as any).retryable : false;
          
          // Try multiple ways to extract the error message
          let errorMessage = 'Unknown error';
          
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          
          // For ProviderError objects, try the message property directly
          if (isProviderError && (error as any).message) {
            errorMessage = (error as any).message;
          }
          
          // Also try other common error properties
          if (errorMessage === 'Unknown error' && error && typeof error === 'object') {
            const err = error as any;
            if (typeof err.message === 'string' && err.message !== 'Unknown error') {
              errorMessage = err.message;
            } else if (typeof err.error === 'string') {
              errorMessage = err.error;
            } else if (err.error?.message) {
              errorMessage = err.error.message;
            }
          }
          
          console.log('[RETRY] Raw error message:', JSON.stringify(errorMessage));
          console.log('[RETRY] Error details:', { statusCode, provider, retryable, isProviderError });
          
          // Save the error message as the assistant's response to the database
          try {
            const assistantErrorMessage: NewMessage = {
              chatId: chatId,
              role: 'assistant',
              content: errorMessage,
              modelId,
            };

            const [savedAssistantMessage] = await db
              .insert(messages)
              .values(assistantErrorMessage)
              .returning();

            console.log(`[RETRY] Saved error message as assistant response ${savedAssistantMessage.id}`);

            // Update chat message count
            const updatedChatHistory = await db
              .select()
              .from(messages)
              .where(eq(messages.chatId, chatId));

            await db
              .update(chatsTable)
              .set({ 
                messageCount: updatedChatHistory.length,
                updatedAt: new Date(),
              })
              .where(eq(chatsTable.id, chatId));

            console.log('[RETRY] Updated chat message count after error');
          } catch (dbError) {
            console.error('[RETRY] Failed to save error message to database:', dbError);
          }
          
          // Create the error object to be JSON encoded
          const errorData = {
            type: 'stream_error',
            error: errorMessage,
            statusCode: statusCode,
            provider: provider,
            retryable: retryable
          };
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
      
      // Handle cancellation from the client side
      cancel() {
        console.log('[RETRY] Stream cancelled by client disconnect');
        isCancelled = true;
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
    console.error('Retry message error:', error);
    return c.json({
      error: 'Failed to retry message',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

export { chatMessaging }; 