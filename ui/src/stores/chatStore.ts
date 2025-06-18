import { create } from 'zustand';
import { AIModel, Chat, Message, Attachment } from '../types/chat';
import { aiService } from '../services/aiService';
import * as api from '../lib/serverComm';

interface ChatState {
  // Models
  availableModels: AIModel[];
  selectedModelId: string;
  modelsLoaded: boolean;
  
  // Chats
  chats: Chat[];
  chatsLoaded: boolean;
  
  // Pinned chats
  pinnedChats: string[];
  pinnedChatsLoaded: boolean;
  
  // Messages
  messages: Record<string, Message[]>;
  streamingMessageId: string | null;
  streamAbortController: AbortController | null;
  
  // Caching for smooth UX
  messageCache: Record<string, Message[]>;
  loadingChatId: string | null; // Track which chat is currently loading
  
  // UI State
  isSidebarOpen: boolean;
  isLoading: boolean;
  
  // Actions
  loadModels: () => Promise<void>;
  selectModel: (modelId: string) => void;
  createChat: (title?: string) => Promise<string>;
  loadChats: (force?: boolean) => Promise<void>;
  sendMessage: (chatId: string, content: string, attachments?: File[], existingBlobUrls?: Map<File, string>) => Promise<void>;
  cancelStreamingMessage: () => void;
  updateStreamingMessage: (content: string) => void;
  setSidebarOpen: (open: boolean) => void;
  switchToChat: (id: string) => Promise<void>; // New optimized switching method
  preloadRecentChats: () => Promise<void>; // New method for background loading
  updateChatTitle: (chatId: string, title: string) => Promise<void>;
  generateChatTitle: (chatId: string, firstMessage: string) => Promise<void>;
  loadPinnedChats: () => Promise<void>;
  pinChat: (chatId: string) => Promise<void>;
  unpinChat: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  retryMessage: (chatId: string, messageId: string) => Promise<void>;
  branchChatFromMessage: (chatId: string, messageId: string) => Promise<string>;
  shareChat: (chatId: string) => Promise<{ chat: Chat; shareUrl: string }>;
  revokeShareChat: (chatId: string) => Promise<void>;
  importSharedChat: (shareId: string) => Promise<string>;
  clearCurrentNavigation: () => void; // New method to clear navigation state
}

// Default model preference - prioritize recommended models
const DEFAULT_MODEL_PREFERENCES = [
  'Google: Gemini 2.5 Flash',  // First choice - our primary recommended model
  'Google: Gemini 2.5 Pro',
  'Anthropic: Claude Sonnet 4',
  'OpenAI: GPT-4o-mini',
  'OpenAI: o4 Mini',
  // Fallbacks to ID-based matching for backward compatibility
  'google/gemini-2.5-flash-lite-preview-06-17',
  'gemini-2.5-flash',
  'gpt-4o-mini',
  'claude-3-5-haiku',
  'gpt-4o',
  'claude-3-5-sonnet',
  'gemini-1.5-pro'
];

// Utility functions to handle date parsing
const parseDate = (dateValue: string | Date): Date => {
  return typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
};

const parseChat = (chat: any): Chat => ({
  ...chat,
  createdAt: parseDate(chat.createdAt),
  updatedAt: parseDate(chat.updatedAt),
});

const parseMessage = (msg: any): Message => ({
  ...msg,
  createdAt: parseDate(msg.createdAt),
});

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  availableModels: [],
  selectedModelId: '',
  chats: [],
  chatsLoaded: false,
  pinnedChats: [],
  pinnedChatsLoaded: false,
  messages: {},
  streamingMessageId: null,
  streamAbortController: null,
  isSidebarOpen: true,
  isLoading: false,
  modelsLoaded: false,
  messageCache: {},
  loadingChatId: null,

  // Actions
  loadModels: async () => {
    const { modelsLoaded, isLoading, selectedModelId } = get();
    
    // Prevent multiple simultaneous calls
    if (modelsLoaded || isLoading) {
      return;
    }
    
    try {
      set({ isLoading: true });
      const models = await aiService.getAvailableModels();
      
      // Only set a default model if no model is currently selected
      let finalSelectedModelId = selectedModelId;
      
      if (!selectedModelId) {
        // Find the best default model based on preferences
        let defaultModelId = '';
        for (const preferredModel of DEFAULT_MODEL_PREFERENCES) {
          const foundModel = models.find(m => 
            (m.id.includes(preferredModel) || m.name === preferredModel) && m.isAvailable
          );
          if (foundModel) {
            defaultModelId = foundModel.id;
            break;
          }
        }
        
        // Fallback to first available model if no preferred model found
        if (!defaultModelId && models.length > 0) {
          const availableModel = models.find(m => m.isAvailable);
          defaultModelId = availableModel ? availableModel.id : models[0].id;
        }
        
        finalSelectedModelId = defaultModelId;
      } else {
        // User has already selected a model, verify it's still available
        const userSelectedModel = models.find(m => m.id === selectedModelId);
        if (!userSelectedModel || !userSelectedModel.isAvailable) {
          
          // Find a fallback only if user's choice is not available
          for (const preferredModel of DEFAULT_MODEL_PREFERENCES) {
            const foundModel = models.find(m => 
              (m.id.includes(preferredModel) || m.name === preferredModel) && m.isAvailable
            );
            if (foundModel) {
              finalSelectedModelId = foundModel.id;
              break;
            }
          }
        }
      }
      
      set({ 
        availableModels: models,
        selectedModelId: finalSelectedModelId,
        modelsLoaded: true
      });
      
    } catch (error) {
      set({ availableModels: [], selectedModelId: '', modelsLoaded: true });
    } finally {
      set({ isLoading: false });
    }
  },

  selectModel: (modelId: string) => {
    set({ selectedModelId: modelId });
  },

  createChat: async (title?: string) => {
    try {
      const { selectedModelId, availableModels } = get();
      
      // If no model is selected yet, try to use a default one
      let modelIdToUse = selectedModelId;
      
      if (!modelIdToUse) {
        // If models are loaded, find a default
        if (availableModels.length > 0) {
          for (const preferredModel of DEFAULT_MODEL_PREFERENCES) {
            const foundModel = availableModels.find(m => 
              (m.id.includes(preferredModel) || m.name === preferredModel) && m.isAvailable
            );
            if (foundModel) {
              modelIdToUse = foundModel.id;
              // Update the selected model for future use
              set({ selectedModelId: modelIdToUse });
              break;
            }
          }
          
          // Fallback to first available model
          if (!modelIdToUse) {
            const availableModel = availableModels.find(m => m.isAvailable);
            modelIdToUse = availableModel ? availableModel.id : availableModels[0].id;
            set({ selectedModelId: modelIdToUse });
          }
        } else {
          // Models haven't loaded yet, use a reasonable default
          modelIdToUse = 'google/gemini-2.5-flash-lite-preview-06-17';
          set({ selectedModelId: modelIdToUse });
        }
      }

      const chat = await api.createChat({
        title: title || 'New Chat',
        modelId: modelIdToUse,
      });

      const parsedChat = parseChat(chat);
      
      set(state => ({
        chats: [parsedChat, ...state.chats],
        messages: {
          ...state.messages,
          [parsedChat.id]: []
        }
      }));

      return parsedChat.id;
    } catch (error) {
      throw error;
    }
  },

  loadChats: async (force = false) => {
    const { chatsLoaded, isLoading, preloadRecentChats } = get();
    
    // Prevent multiple simultaneous calls (unless forced)
    if (!force && (chatsLoaded || isLoading)) {
      return;
    }
    
    try {
      set({ isLoading: true });
      const chats = await api.getChats();
      const parsedChats = chats.map(parseChat);
      set({ 
        chats: parsedChats,
        chatsLoaded: true
      });
      
      // Start preloading recent chats in the background
      setTimeout(() => {
        preloadRecentChats().catch(() => {
          // Background preloading failed - handle silently
        });
      }, 500); // Small delay to let the UI settle
      
    } catch (error) {
      set({ 
        chats: [],
        chatsLoaded: true
      });
    } finally {
      set({ isLoading: false });
    }
  },

  sendMessage: async (chatId: string, content: string, attachments?: File[], existingBlobUrls?: Map<File, string>) => {
    // Declare IDs outside try block so they're accessible in catch
    const tempUserMessageId = `temp-user-${Date.now()}`;
    const tempAssistantMessageId = `temp-assistant-${Date.now()}`;

    try {
      let { selectedModelId } = get();
      
      // Ensure we have a valid model selected before proceeding
      if (!selectedModelId) {
        await get().loadModels();
        selectedModelId = get().selectedModelId;
        
        // If still no model after loading, this indicates a serious issue
        if (!selectedModelId) {
          throw new Error('No models available - check your API configuration');
        }
      }

      // 2. CREATE OPTIMISTIC ATTACHMENTS
      let optimisticAttachments: Attachment[] | undefined;
      if (attachments && attachments.length > 0) {
        optimisticAttachments = attachments.map((file, index) => {
          // Check for existing blob URL first
          let previewUrl = existingBlobUrls?.get(file);
          
          // Create new blob URL only if we don't have one
          if (!previewUrl && file.type.startsWith('image/')) {
            previewUrl = URL.createObjectURL(file);
          }
          
          return {
            id: `temp-attachment-${Date.now()}-${index}`,
            filename: file.name,
            fileType: file.type,
            fileSize: file.size,
            previewUrl,
            status: 'uploading' as const,
            createdAt: new Date(),
          };
        });
      }

      // 3. CREATE OPTIMISTIC MESSAGES
      const tempUserMessage: Message = {
        id: tempUserMessageId,
        chatId,
        role: 'user',
        content,
        attachments: optimisticAttachments,
        createdAt: new Date(),
        isOptimistic: true,
      };

      const tempAssistantMessage: Message = {
        id: tempAssistantMessageId,
        chatId,
        role: 'assistant',
        content: '',
        modelId: selectedModelId,
        createdAt: new Date(),
        isStreaming: true,
        isOptimistic: true,
      };

      // 3. SHOW MESSAGES IMMEDIATELY 
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: [
            ...(state.messages[chatId] || []),
            tempUserMessage,
            tempAssistantMessage
          ]
        },
        streamingMessageId: tempAssistantMessageId
      }));

      // 4. UPLOAD FILES IN BACKGROUND (without changing attachment objects)
      let uploadedAttachments: Attachment[] = [];
      if (attachments && attachments.length > 0) {
        
        const uploadPromises = attachments.map(async (file, index) => {
          try {
            const uploaded = await aiService.uploadFile(file);
            return { index, uploaded };
          } catch (error) {
            return { index, error };
          }
        });

        const results = await Promise.allSettled(uploadPromises);
        
        // 5. UPDATE ATTACHMENT STATUS IN PLACE (preserve object identity)
        const updatedAttachments = optimisticAttachments?.map((optimisticAtt, index) => {
          const result = results[index];
          if (result.status === 'fulfilled' && result.value && 'uploaded' in result.value && result.value.uploaded) {
            // SUCCESS: Update with uploaded data but keep same object structure
            uploadedAttachments.push(result.value.uploaded);
            
            // Clean up the blob URL since upload is complete
            if (optimisticAtt.previewUrl && optimisticAtt.previewUrl.startsWith('blob:')) {
              URL.revokeObjectURL(optimisticAtt.previewUrl);
            }
            
            return {
              ...optimisticAtt, // Keep same base object
              id: result.value.uploaded.id, // Update to real ID
              status: 'uploaded' as const,
              url: result.value.uploaded.url, // Add server URL if available
              previewUrl: undefined, // Remove blob URL since upload is complete
            };
          } else {
            // ERROR: Mark as failed but keep preview for retry
            return {
              ...optimisticAtt,
              status: 'error' as const
            };
          }
        });

        // Update message with new attachment status (minimal state change)
        set(state => ({
          messages: {
            ...state.messages,
            [chatId]: state.messages[chatId].map(msg =>
              msg.id === tempUserMessageId
                ? { ...msg, attachments: updatedAttachments }
                : msg
            )
          }
        }));

        // Commit files to R2 for persistence
        if (uploadedAttachments.length > 0) {
          const fileIds = uploadedAttachments.map(att => att.id);
          try {
            await aiService.commitFilesToR2(fileIds);
          } catch (error) {
            // R2 commit failed, continue
          }
        }
      }

      // 6. CHECK IF IMAGE GENERATION MODEL AND HANDLE APPROPRIATELY
      const { availableModels } = get();
      const selectedModel = availableModels.find(model => model.id === selectedModelId);
      const isImageModel = selectedModel?.capabilities?.includes('image-generation') || false;

      if (isImageModel) {
        console.log(`[CHAT-STORE] Image generation model detected: ${selectedModelId}, using streaming with partial images`);
        // Continue to streaming logic below
      }

      // 6. STREAM AI RESPONSE (for text models)
      let fullContent = '';
      let updateTimeout: NodeJS.Timeout | null = null;
      let pendingUpdate = false;
      let chunkCount = 0;

      
      // Create abort controller for this stream
      const abortController = new AbortController();
      set({ streamAbortController: abortController });
      
      const throttledUpdate = (content: string) => {
        if (pendingUpdate) return;
        
        pendingUpdate = true;
        if (updateTimeout) clearTimeout(updateTimeout);
        
        updateTimeout = setTimeout(() => {
          set(state => ({
            messages: {
              ...state.messages,
              [chatId]: state.messages[chatId].map(msg =>
                msg.id === tempAssistantMessageId
                  ? { ...msg, content }
                  : msg
              )
            }
          }));
          pendingUpdate = false;
        }, 50); // Update UI at most every 50ms
      };

      // Get the streaming response with HTTP-based streaming that includes message events
      const streamResponse = await api.streamChatResponse({
        chatId,
        content,
        modelId: selectedModelId,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        abortController
      });

      // Track if stream was cancelled
      let wasCancelled = false;
      
      // Set up cancellation detection
      if (abortController.signal) {
        abortController.signal.addEventListener('abort', () => {
          wasCancelled = true;
          console.log('[CHAT-STORE] Stream cancellation detected');
        });
      }

      // Custom stream processing to handle server events
      const streamWithEventHandling = async function* () {
        try {
          for await (const chunk of streamResponse) {
            console.log(`[CHAT-STORE] Raw chunk received:`, { chunk, hasReplace: chunk.startsWith('REPLACE:') });
            
            // Handle REPLACE: prefix for image generation progress updates
            if (chunk.startsWith('REPLACE:')) {
              const cleanChunk = chunk.substring(8); // Remove "REPLACE:" prefix
              console.log(`[CHAT-STORE] Processing REPLACE chunk:`, { original: chunk, clean: cleanChunk });
              fullContent = cleanChunk; // Replace content entirely
              yield cleanChunk; // Yield without the REPLACE: prefix
            } else {
              fullContent += chunk; // Normal accumulative behavior
              yield chunk;
            }
            chunkCount++;
          }
        } catch (error) {
          // Check if this is an abort error (cancellation)
          if (error instanceof Error && error.name === 'AbortError') {
            wasCancelled = true;
            console.log('[CHAT-STORE] Stream cancelled via AbortError');
            return; // Exit gracefully
          }
          // Re-throw other streaming errors
          throw error;
        }
      };
      
      // Process the stream
      try {
        for await (const _chunk of streamWithEventHandling()) {
          // Use throttled update instead of immediate update
          throttledUpdate(fullContent);
        }
      } catch (error) {
        // Handle abort gracefully
        if (error instanceof Error && error.name === 'AbortError') {
          wasCancelled = true;
          console.log('[CHAT-STORE] Stream processing cancelled');
          return; // Exit gracefully for cancellation
        }
        
        // Re-throw other streaming errors
        throw error;
      }
      
      // Ensure final update is applied
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      // Apply final content update
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: state.messages[chatId].map(msg =>
            msg.id === tempAssistantMessageId
              ? { ...msg, content: fullContent }
              : msg
          )
        }
      }));

      // 7. FINALIZE: Mark messages as non-optimistic and replace temp IDs with real ones
      // If cancelled, wait a moment for the server to save the partial content, then fetch
      if (wasCancelled) {
        console.log('[CHAT-STORE] Finalizing cancelled stream');
        // Wait a bit for the server to process the cancellation and save the partial message
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Since we don't have access to the real IDs from the current streaming setup,
      // we need to fetch the latest messages to get the real IDs
      try {
        const { messages: latestMessages } = await api.getChat(chatId);
        const realMessages = latestMessages.slice(-2); // Get the last 2 messages (user + assistant)
        
        if (realMessages.length >= 2) {
          const realUserMsg = realMessages[0];
          const realAssistantMsg = realMessages[1];
          
          console.log(`[CHAT-STORE] Finalizing with real messages - User: ${realUserMsg.id}, Assistant: ${realAssistantMsg.id}`, {
            cancelled: wasCancelled,
            assistantContent: realAssistantMsg.content.substring(0, 100) + '...'
          });
          
          // Replace temporary messages with real ones from server
          set(state => ({
            messages: {
              ...state.messages,
              [chatId]: state.messages[chatId].map(msg => {
                if (msg.id === tempUserMessageId) {
                  return {
                    ...realUserMsg,
                    attachments: msg.attachments, // Keep uploaded attachments from optimistic update
                    createdAt: typeof realUserMsg.createdAt === 'string' ? new Date(realUserMsg.createdAt) : realUserMsg.createdAt,
                  };
                } else if (msg.id === tempAssistantMessageId) {
                  return {
                    ...realAssistantMsg,
                    createdAt: typeof realAssistantMsg.createdAt === 'string' ? new Date(realAssistantMsg.createdAt) : realAssistantMsg.createdAt,
                    isStreaming: false, // Ensure streaming state is cleared
                    isOptimistic: false, // Mark as finalized
                  };
                }
                return msg;
              })
            },
            streamingMessageId: null,
            streamAbortController: null
          }));
          
        } else {
          // Fallback: just mark as non-optimistic without ID replacement
          console.log('[CHAT-STORE] Fallback finalization (no real messages found)', { wasCancelled });
          set(state => ({
            messages: {
              ...state.messages,
              [chatId]: state.messages[chatId].map(msg =>
                msg.id === tempUserMessageId || msg.id === tempAssistantMessageId
                  ? { ...msg, isOptimistic: false, isStreaming: false }
                  : msg
              )
            },
            streamingMessageId: null,
            streamAbortController: null
          }));
          
        }
      } catch (fetchError) {
        
        // Fallback: just mark as non-optimistic
        console.log('[CHAT-STORE] Fallback finalization (fetch error)', { wasCancelled, fetchError });
        set(state => ({
          messages: {
            ...state.messages,
            [chatId]: state.messages[chatId].map(msg =>
              msg.id === tempUserMessageId || msg.id === tempAssistantMessageId
                ? { ...msg, isOptimistic: false, isStreaming: false }
                : msg
            )
          },
          streamingMessageId: null,
          streamAbortController: null
        }));
      }

      // Generate chat title if this is the first exchange
      const { generateChatTitle, chats } = get();
      const chat = chats.find(c => c.id === chatId);
      const currentMessages = get().messages[chatId] || [];
      
      if (chat && currentMessages.length === 2 && chat.title === 'New Chat') {
        try {
          await generateChatTitle(chatId, content);
        } catch (error) {
          // Failed to generate chat title - handle silently
        }
      }

    } catch (error) {
      
      // Check if this is a provider error with specific handling
      const isProviderError = error && typeof error === 'object' && 'isProviderError' in error;

      
      if (isProviderError) {
        // Extract the actual error message - this is the helpful user-facing message
        const actualErrorMessage = error instanceof Error ? error.message : 'Unknown provider error';
        

        
        // Just show the actual error message without trying to be clever
        const errorMessage = actualErrorMessage;
        
        // Update the assistant message with the error
        set(state => ({
          messages: {
            ...state.messages,
            [chatId]: state.messages[chatId].map(msg =>
              msg.id === tempAssistantMessageId
                ? { ...msg, content: errorMessage, isOptimistic: false, isStreaming: false }
                : msg.id === tempUserMessageId
                ? { ...msg, isOptimistic: false }
                : msg
            )
          },
          streamingMessageId: null,
          streamAbortController: null
        }));
        
        return; // Don't throw, we've handled it gracefully
      }
      
      // For non-provider errors, use the original behavior
      // Remove any optimistic messages on error
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: state.messages[chatId].filter(
            msg => !msg.isOptimistic
          )
        },
        streamingMessageId: null,
        streamAbortController: null
      }));
      throw error;
    }
  },

  updateStreamingMessage: (content: string) => {
    const { streamingMessageId, messages } = get();
    if (!streamingMessageId) return;

    // Find which chat has the streaming message
    const chatId = Object.keys(messages).find(cId => 
      messages[cId].some(msg => msg.id === streamingMessageId)
    );
    
    if (!chatId) return;

    set(state => ({
      messages: {
        ...state.messages,
        [chatId]: state.messages[chatId].map(msg =>
          msg.id === streamingMessageId
            ? { ...msg, content }
            : msg
        )
      }
    }));
  },

  cancelStreamingMessage: async () => {
    const { streamAbortController, streamingMessageId, messages, selectedModelId } = get();
    
    if (!streamAbortController || !streamingMessageId) {
      console.log('[CHAT-STORE] No active stream to cancel');
      return;
    }

    // Find the chat with the streaming message
    const chatId = Object.keys(messages).find(cId => 
      messages[cId].some(msg => msg.id === streamingMessageId)
    );

    if (!chatId) {
      console.log('[CHAT-STORE] Could not find chat with streaming message');
      return;
    }

    // Get the current partial content
    const streamingMessage = messages[chatId].find(msg => msg.id === streamingMessageId);
    const partialContent = streamingMessage?.content || '';

    console.log('[CHAT-STORE] Cancelling streaming message with graceful save', {
      chatId,
      contentLength: partialContent.length,
      messageId: streamingMessageId
    });

    try {
      // First, call the cancel endpoint to save the partial content
      if (partialContent && selectedModelId) {
        console.log('[CHAT-STORE] Saving partial content via cancel endpoint');
        const cancelResult = await api.cancelStream({
          chatId,
          partialContent,
          modelId: selectedModelId
        });

        console.log('[CHAT-STORE] Partial content saved successfully', {
          messageId: cancelResult.message.id,
          savedLength: cancelResult.message.content.length
        });

        // Update the UI with the saved message immediately
        set(state => ({
          messages: {
            ...state.messages,
            [chatId]: state.messages[chatId].map(msg =>
              msg.id === streamingMessageId
                ? {
                    ...cancelResult.message,
                    createdAt: typeof cancelResult.message.createdAt === 'string' 
                      ? new Date(cancelResult.message.createdAt) 
                      : cancelResult.message.createdAt,
                    isStreaming: false,
                    isOptimistic: false,
                  }
                : msg
            )
          },
          streamingMessageId: null,
          streamAbortController: null
        }));
      } else {
        console.log('[CHAT-STORE] No content to save, just cleaning up state');
        // If no content, just clean up the state
        set(state => ({
          messages: {
            ...state.messages,
            [chatId]: state.messages[chatId].filter(msg => msg.id !== streamingMessageId)
          },
          streamingMessageId: null,
          streamAbortController: null
        }));
      }
    } catch (error) {
      console.error('[CHAT-STORE] Failed to save partial content:', error);
      
      // Fallback: just mark the message as finalized with current content
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: state.messages[chatId].map(msg =>
            msg.id === streamingMessageId
              ? { ...msg, isStreaming: false, isOptimistic: false }
              : msg
          )
        },
        streamingMessageId: null,
        streamAbortController: null
      }));
    }

    // Finally, abort the stream to stop any ongoing network activity
    streamAbortController.abort();
    console.log('[CHAT-STORE] Stream aborted after graceful save');
  },

  setSidebarOpen: (open: boolean) => {
    set({ isSidebarOpen: open });
  },

  switchToChat: async (id: string) => {
    const { messages, messageCache, loadingChatId } = get();
    
    // If already loading this chat, don't start another load
    if (loadingChatId === id) {
      return;
    }
    
    // Optimized: Check both messages and cache first
    if (messages[id] || messageCache[id]) {
      if (messageCache[id] && !messages[id]) {
        // Restore from cache instantly without triggering a re-render loop
        set(state => ({
          messages: {
            ...state.messages,
            [id]: state.messageCache[id]
          }
        }));
      }
      return;
    }
    
    try {
      
      // Set loading state
      set({ loadingChatId: id });
      
      const { messages: chatMessages } = await api.getChat(id);
      const parsedMessages = chatMessages.map(parseMessage);
      
      // Single atomic update to prevent multiple re-renders
      set(state => ({
        messages: {
          ...state.messages,
          [id]: parsedMessages
        },
        messageCache: {
          ...state.messageCache,
          [id]: parsedMessages
        },
        loadingChatId: null
      }));
      
    } catch (error) {
      set({ loadingChatId: null });
      throw error;
    }
  },

  preloadRecentChats: async () => {
    const { chats, messageCache } = get();
    
    // Get the 3 most recent chats that aren't already cached
    const recentChats = chats
      .slice(0, 3)
      .filter(chat => !messageCache[chat.id]);
    
    if (recentChats.length === 0) {
      return;
    }
    
    // Load messages for recent chats in parallel
    const loadPromises = recentChats.map(async (chat) => {
      try {
        const { messages: chatMessages } = await api.getChat(chat.id);
        const parsedMessages = chatMessages.map(parseMessage);
        
        // Cache the messages (but don't activate the chat)
        set(state => ({
          messageCache: {
            ...state.messageCache,
            [chat.id]: parsedMessages
          }
        }));
        
      } catch (error) {
        // Failed to preload chat - handle silently
      }
    });
    
    await Promise.allSettled(loadPromises);
  },

  updateChatTitle: async (chatId: string, title: string) => {
    try {
      const updatedChat = await api.updateChatTitle(chatId, title);
      const parsedChat = parseChat(updatedChat);
      
      set(state => ({
        chats: state.chats.map(chat =>
          chat.id === chatId ? parsedChat : chat
        )
      }));
    } catch (error) {
      throw error;
    }
  },

  generateChatTitle: async (chatId: string, firstMessage: string) => {
    try {
      const { selectedModelId } = get();
      const result = await api.generateTitle({
        chatId,
        content: firstMessage,
        modelId: selectedModelId || 'google/gemini-2.5-flash-lite-preview-06-17'
      });
      
      // Update the chat title
      await get().updateChatTitle(chatId, result.title);
      
    } catch (error) {
      throw error;
    }
  },

  loadPinnedChats: async () => {
    const { pinnedChatsLoaded } = get();
    
    if (pinnedChatsLoaded) {
      return;
    }
    
    try {
      const pinnedChats = await api.getUserPinnedChats();
      
      set({ 
        pinnedChats,
        pinnedChatsLoaded: true 
      });
      
    } catch (error) {
      set({ pinnedChats: [], pinnedChatsLoaded: true });
    }
  },

  pinChat: async (chatId: string) => {
    const { pinnedChats } = get();
    
    // Optimistic update - add to pinned chats immediately
    const optimisticPinnedChats = [...pinnedChats, chatId];
    set({ pinnedChats: optimisticPinnedChats });
    
    
    try {
      // Call API in background
      const updatedPinnedChats = await api.pinChat(chatId);
      
      // Update with server response (in case server has different state)
      set({ pinnedChats: updatedPinnedChats });
      
      
    } catch (error) {
      
      // Revert optimistic update on error
      set({ pinnedChats });
      
      throw error;
    }
  },

  unpinChat: async (chatId: string) => {
    const { pinnedChats } = get();
    
    // Optimistic update - remove from pinned chats immediately
    const optimisticPinnedChats = pinnedChats.filter(id => id !== chatId);
    set({ pinnedChats: optimisticPinnedChats });
    
    
    try {
      // Call API in background
      const updatedPinnedChats = await api.unpinChat(chatId);
      
      // Update with server response (in case server has different state)
      set({ pinnedChats: updatedPinnedChats });
      
    } catch (error) {
      
      // Revert optimistic update on error
      set({ pinnedChats });
      
      throw error;
    }
  },

  deleteChat: async (chatId: string) => {
    try {
      
      // Call API to delete chat
      await api.deleteChat(chatId);
      
      // Remove chat from store
      set(state => {
        const { [chatId]: deletedMessages, ...remainingMessages } = state.messages;
        const { [chatId]: deletedCache, ...remainingCache } = state.messageCache;
        
        return {
          chats: state.chats.filter(chat => chat.id !== chatId),
          messages: remainingMessages,
          messageCache: remainingCache,
          pinnedChats: state.pinnedChats.filter(id => id !== chatId) // Remove from pinned if present
        };
      });
      
    } catch (error) {
      throw error;
    }
  },

  branchChatFromMessage: async (chatId: string, messageId: string) => {
    try {
      
      const result = await api.branchChatFromMessage(chatId, messageId);
      const newChat = parseChat(result.chat);
      
      // Add the new branched chat to the store
      set(state => ({
        chats: [newChat, ...state.chats]
      }));
      
      
      return newChat.id;
    } catch (error) {
      throw error;
    }
  },

  shareChat: async (chatId: string) => {
    try {
      
      const result = await api.shareChat(chatId);
      const updatedChat = parseChat(result.chat);
      
      // Update the chat in the store with sharing info
      set(state => ({
        chats: state.chats.map(chat =>
          chat.id === chatId ? updatedChat : chat
        )
      }));
      
      return { chat: updatedChat, shareUrl: result.shareUrl };
    } catch (error) {
      throw error;
    }
  },

  revokeShareChat: async (chatId: string) => {
    try {
      
      await api.revokeShareChat(chatId);
      
      // Update the chat in the store to remove sharing info
      set(state => ({
        chats: state.chats.map(chat =>
          chat.id === chatId 
            ? { ...chat, isShared: false, shareId: undefined, sharedAt: undefined }
            : chat
        )
      }));
      
    } catch (error) {
      throw error;
    }
  },

  importSharedChat: async (shareId: string) => {
    try {
      
      const importedChat = await api.importSharedChat(shareId);
      const newChat = parseChat(importedChat);
      
      // Add the imported chat to the store
      set(state => ({
        chats: [newChat, ...state.chats]
      }));
      
      return newChat.id;
    } catch (error) {
      throw error;
    }
  },

  retryMessage: async (chatId: string, messageId: string) => {
    try {
      console.log(`[CHAT-STORE] Starting retry for message ${messageId} in chat ${chatId}`);
      
      const { messages } = get();
      const chatMessages = messages[chatId] || [];
      
      // Find the message to retry and ensure it's the last assistant message
      const messageToRetry = chatMessages.find(msg => msg.id === messageId);
      if (!messageToRetry) {
        throw new Error('Message not found');
      }
      
      if (messageToRetry.role !== 'assistant') {
        throw new Error('Can only retry assistant messages');
      }
      
      // Check if this is the last message in the conversation
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (lastMessage?.id !== messageId) {
        throw new Error('Can only retry the last message in the conversation');
      }
      
      console.log(`[CHAT-STORE] Validated retry request - removing message and starting retry`);
      
      // Remove the message to retry from the UI immediately
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: state.messages[chatId].filter(msg => msg.id !== messageId)
        }
      }));
      
      // Create a temporary streaming message
      const tempRetryMessageId = `temp-retry-${Date.now()}`;
      const tempRetryMessage: Message = {
        id: tempRetryMessageId,
        chatId,
        role: 'assistant',
        content: '',
        modelId: messageToRetry.modelId,
        createdAt: new Date(),
        isStreaming: true,
        isOptimistic: true,
      };
      
      // Add the temporary streaming message
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: [...state.messages[chatId], tempRetryMessage]
        },
        streamingMessageId: tempRetryMessageId
      }));
      
      // Start streaming the retry
      let fullContent = '';
      let chunkCount = 0;
      let pendingUpdate = false;
      let updateTimeout: NodeJS.Timeout | null = null;
      
      const throttledUpdate = (content: string) => {
        if (pendingUpdate) return;
        
        pendingUpdate = true;
        if (updateTimeout) clearTimeout(updateTimeout);
        
        updateTimeout = setTimeout(() => {
          set(state => ({
            messages: {
              ...state.messages,
              [chatId]: state.messages[chatId].map(msg =>
                msg.id === tempRetryMessageId
                  ? { ...msg, content }
                  : msg
              )
            }
          }));
          pendingUpdate = false;
        }, 50); // Update UI at most every 50ms
      };
      
      // Get the streaming response
      const streamResponse = await api.retryMessage({
        chatId,
        messageId
      });
      
      // Process the stream
      try {
        for await (const chunk of streamResponse) {
          console.log(`[CHAT-STORE-RETRY] Raw chunk received:`, { chunk, hasReplace: chunk.startsWith('REPLACE:') });
          
          // Handle REPLACE: prefix for image generation progress updates
          if (chunk.startsWith('REPLACE:')) {
            const cleanChunk = chunk.substring(8); // Remove "REPLACE:" prefix
            console.log(`[CHAT-STORE-RETRY] Processing REPLACE chunk:`, { original: chunk, clean: cleanChunk });
            fullContent = cleanChunk; // Replace content entirely
          } else {
            fullContent += chunk; // Normal accumulative behavior
          }
          chunkCount++;
          // Use throttled update instead of immediate update
          throttledUpdate(fullContent);
        }
      } catch (error) {
        console.error('[CHAT-STORE] Retry streaming error:', error);
        throw error;
      }
      
      // Ensure final update is applied
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      // Apply final content update
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: state.messages[chatId].map(msg =>
            msg.id === tempRetryMessageId
              ? { ...msg, content: fullContent }
              : msg
          )
        }
      }));
      
      console.log(`[CHAT-STORE] Retry streaming completed, fetching final messages from server`);
      
      // Fetch the latest messages to get the real IDs
      try {
        const { messages: latestMessages } = await api.getChat(chatId);
        const realMessage = latestMessages[latestMessages.length - 1]; // Get the last message (the retry result)
        
        if (realMessage) {
          console.log(`[CHAT-STORE] Finalizing retry with real message - ID: ${realMessage.id}`);
          
          // Replace temporary message with real one from server
          set(state => ({
            messages: {
              ...state.messages,
              [chatId]: state.messages[chatId].map(msg => {
                if (msg.id === tempRetryMessageId) {
                  return {
                    ...realMessage,
                    createdAt: typeof realMessage.createdAt === 'string' ? new Date(realMessage.createdAt) : realMessage.createdAt,
                    isStreaming: false,
                    isOptimistic: false,
                  };
                }
                return msg;
              })
            },
            streamingMessageId: null
          }));
        } else {
          // Fallback: just mark as non-optimistic
          console.log('[CHAT-STORE] Fallback finalization (no real message found)');
          set(state => ({
            messages: {
              ...state.messages,
              [chatId]: state.messages[chatId].map(msg =>
                msg.id === tempRetryMessageId
                  ? { ...msg, isOptimistic: false, isStreaming: false }
                  : msg
              )
            },
            streamingMessageId: null
          }));
        }
      } catch (fetchError) {
        // Fallback: just mark as non-optimistic
        console.log('[CHAT-STORE] Fallback finalization (fetch error)', { fetchError });
        set(state => ({
          messages: {
            ...state.messages,
            [chatId]: state.messages[chatId].map(msg =>
              msg.id === tempRetryMessageId
                ? { ...msg, isOptimistic: false, isStreaming: false }
                : msg
            )
          },
          streamingMessageId: null
        }));
      }
      
      console.log(`[CHAT-STORE] Retry completed successfully`);
      
    } catch (error) {
      console.error('[CHAT-STORE] Retry failed:', error);
      
      // Clean up streaming state
      set(() => ({
        streamingMessageId: null
      }));
      
      throw error;
    }
  },

  clearCurrentNavigation: () => {
    set({
      availableModels: [],
      selectedModelId: '',
      chats: [],
      chatsLoaded: false,
      pinnedChats: [],
      pinnedChatsLoaded: false,
      messages: {},
      streamingMessageId: null,
      streamAbortController: null,
      isSidebarOpen: true,
      isLoading: false,
      modelsLoaded: false,
      messageCache: {},
      loadingChatId: null,
    });
  },
})); 