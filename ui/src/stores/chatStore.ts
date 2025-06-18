import { create } from 'zustand';
import { AIModel, Chat, Message, Attachment } from '../types/chat';
import { aiService } from '../services/aiService';
import { api } from '../lib/serverComm';

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
  branchChatFromMessage: (chatId: string, messageId: string) => Promise<string>;
}

// Default model preference - Gemini Flash
const DEFAULT_MODEL_PREFERENCES = [
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
      console.log('Loading models...');
      set({ isLoading: true });
      const models = await aiService.getAvailableModels();
      console.log('Models loaded:', models);
      
      // Only set a default model if no model is currently selected
      let finalSelectedModelId = selectedModelId;
      
      if (!selectedModelId) {
        // Find the best default model based on preferences
        let defaultModelId = '';
        for (const preferredModel of DEFAULT_MODEL_PREFERENCES) {
          const foundModel = models.find(m => m.id.includes(preferredModel) && m.isAvailable);
          if (foundModel) {
            defaultModelId = foundModel.id;
            console.log('Selected default model:', defaultModelId);
            break;
          }
        }
        
        // Fallback to first available model if no preferred model found
        if (!defaultModelId && models.length > 0) {
          const availableModel = models.find(m => m.isAvailable);
          defaultModelId = availableModel ? availableModel.id : models[0].id;
          console.log('Using fallback default model:', defaultModelId);
        }
        
        finalSelectedModelId = defaultModelId;
      } else {
        // User has already selected a model, verify it's still available
        const userSelectedModel = models.find(m => m.id === selectedModelId);
        if (!userSelectedModel || !userSelectedModel.isAvailable) {
          console.log('User selected model no longer available, selecting fallback:', selectedModelId);
          
          // Find a fallback only if user's choice is not available
          for (const preferredModel of DEFAULT_MODEL_PREFERENCES) {
            const foundModel = models.find(m => m.id.includes(preferredModel) && m.isAvailable);
            if (foundModel) {
              finalSelectedModelId = foundModel.id;
              console.log('Fallback model for unavailable selection:', finalSelectedModelId);
              break;
            }
          }
        } else {
          console.log('Keeping user selected model:', selectedModelId);
        }
      }
      
      set({ 
        availableModels: models,
        selectedModelId: finalSelectedModelId,
        modelsLoaded: true
      });
      
      console.log('Model loading complete. Available models:', models.length, 'Selected:', finalSelectedModelId);
    } catch (error) {
      console.error('Failed to load models:', error);
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
            const foundModel = availableModels.find(m => m.id.includes(preferredModel) && m.isAvailable);
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
      console.error('Failed to create chat:', error);
      throw error;
    }
  },

  loadChats: async (force = false) => {
    const { chatsLoaded, isLoading, preloadRecentChats } = get();
    
    // Prevent multiple simultaneous calls (unless forced)
    if (!force && (chatsLoaded || isLoading)) {
      console.log('[CHAT-STORE] loadChats skipped:', { chatsLoaded, isLoading });
      return;
    }
    
    try {
      console.log('Loading chats...');
      set({ isLoading: true });
      const chats = await api.getChats();
      const parsedChats = chats.map(parseChat);
      set({ 
        chats: parsedChats,
        chatsLoaded: true
      });
      console.log(`Chats loaded: ${parsedChats.length} chats`);
      
      // Start preloading recent chats in the background
      setTimeout(() => {
        preloadRecentChats().catch(error => {
          console.warn('[CHAT-STORE] Background preloading failed:', error);
        });
      }, 500); // Small delay to let the UI settle
      
    } catch (error) {
      console.error('Failed to load chats:', error);
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
        console.log('[CHAT-STORE] No model selected, loading models and selecting default...');
        await get().loadModels();
        selectedModelId = get().selectedModelId;
        
        // If still no model after loading, this indicates a serious issue
        if (!selectedModelId) {
          throw new Error('No models available - check your API configuration');
        }
      }
      
      console.log('[CHAT-STORE] Starting sendMessage flow with model:', selectedModelId);

      // 2. CREATE OPTIMISTIC ATTACHMENTS
      let optimisticAttachments: Attachment[] | undefined;
      if (attachments && attachments.length > 0) {
        console.log('[CHAT-STORE] Creating optimistic attachments');
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

      console.log('[CHAT-STORE] Optimistic messages created immediately');

      // 4. UPLOAD FILES IN BACKGROUND (without changing attachment objects)
      let uploadedAttachments: Attachment[] = [];
      if (attachments && attachments.length > 0) {
        console.log('[CHAT-STORE] Starting background uploads');
        
        const uploadPromises = attachments.map(async (file, index) => {
          try {
            const uploaded = await aiService.uploadFile(file);
            return { index, uploaded };
          } catch (error) {
            console.error('[CHAT-STORE] File upload failed:', error);
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
          console.log('[CHAT-STORE] Committing files to R2:', fileIds);
          try {
            await aiService.commitFilesToR2(fileIds);
          } catch (error) {
            console.warn('[CHAT-STORE] R2 commit failed, continuing:', error);
          }
        }
      }

      console.log('[CHAT-STORE] Starting AI stream');

      // 6. STREAM AI RESPONSE
      let fullContent = '';
      let updateTimeout: NodeJS.Timeout | null = null;
      let pendingUpdate = false;
      let chunkCount = 0;
      let realUserMessageId: string | null = null;
      let realAssistantMessageId: string | null = null;
      
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
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined
      });

      // Custom stream processing to handle server events
      const streamWithEventHandling = async function* () {
        try {
          for await (const chunk of streamResponse) {
            // Check if this is an SSE event data (should be handled by streamChatResponse)
            // but we need to access the events here for message ID replacement
            fullContent += chunk;
            chunkCount++;
            yield chunk;
          }
        } catch (error) {
          // Re-throw streaming errors
          throw error;
        }
      };
      
      // Process the stream
      for await (const chunk of streamWithEventHandling()) {
        // Use throttled update instead of immediate update
        throttledUpdate(fullContent);
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
      // Since we don't have access to the real IDs from the current streaming setup,
      // we need to fetch the latest messages to get the real IDs
      try {
        console.log('[CHAT-STORE] Fetching real message IDs from server');
        const { messages: latestMessages } = await api.getChat(chatId);
        const realMessages = latestMessages.slice(-2); // Get the last 2 messages (user + assistant)
        
        if (realMessages.length >= 2) {
          const realUserMsg = realMessages[0];
          const realAssistantMsg = realMessages[1];
          
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
                  };
                }
                return msg;
              })
            },
            streamingMessageId: null
          }));
          
          console.log('[CHAT-STORE] Successfully replaced temporary IDs with real server IDs');
        } else {
          // Fallback: just mark as non-optimistic without ID replacement
          set(state => ({
            messages: {
              ...state.messages,
              [chatId]: state.messages[chatId].map(msg =>
                msg.id === tempUserMessageId || msg.id === tempAssistantMessageId
                  ? { ...msg, isOptimistic: false, isStreaming: false }
                  : msg
              )
            },
            streamingMessageId: null
          }));
          
          console.warn('[CHAT-STORE] Could not get real message IDs, keeping temporary IDs');
        }
      } catch (fetchError) {
        console.error('[CHAT-STORE] Failed to fetch real message IDs:', fetchError);
        
        // Fallback: just mark as non-optimistic
        set(state => ({
          messages: {
            ...state.messages,
            [chatId]: state.messages[chatId].map(msg =>
              msg.id === tempUserMessageId || msg.id === tempAssistantMessageId
                ? { ...msg, isOptimistic: false, isStreaming: false }
                : msg
            )
          },
          streamingMessageId: null
        }));
      }

      console.log('[CHAT-STORE] Message flow completed successfully');

      // Generate chat title if this is the first exchange
      const { generateChatTitle, chats } = get();
      const chat = chats.find(c => c.id === chatId);
      const currentMessages = get().messages[chatId] || [];
      
      if (chat && currentMessages.length === 2 && chat.title === 'New Chat') {
        try {
          await generateChatTitle(chatId, content);
        } catch (error) {
          console.warn('Failed to generate chat title:', error);
        }
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Check if this is a provider error with specific handling
      const isProviderError = error && typeof error === 'object' && 'isProviderError' in error;
      const statusCode = isProviderError ? (error as any).statusCode : undefined;
      const provider = isProviderError ? (error as any).provider : undefined;
      const retryable = isProviderError ? (error as any).retryable : false;
      
      if (isProviderError) {
        // Create an error message for the assistant instead of removing messages
        let errorMessage = "Sorry, I ran into an error!";
        
        if (statusCode === 429) {
          errorMessage = "Sorry, I ran into a rate limit error! Please try again in a moment.";
          if (statusCode) {
            errorMessage += ` (Error: ${statusCode})`;
          }
        } else if (statusCode) {
          errorMessage += ` (Error: ${statusCode})`;
        }
        
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
          streamingMessageId: null
        }));
        
        console.log('[CHAT-STORE] Provider error handled with error message:', { statusCode, provider, retryable });
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
        streamingMessageId: null
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

  setSidebarOpen: (open: boolean) => {
    set({ isSidebarOpen: open });
  },

  switchToChat: async (id: string) => {
    const { messages, messageCache, loadingChatId } = get();
    
    // If already loading this chat, don't start another load
    if (loadingChatId === id) {
      console.log('[CHAT-STORE] switchToChat: already loading', id);
      return;
    }
    
    // Optimized: Check both messages and cache first
    if (messages[id] || messageCache[id]) {
      console.log('[CHAT-STORE] Using cached/loaded messages for chat:', id);
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
      console.log('[CHAT-STORE] Loading messages for chat:', id);
      
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
      
      console.log(`[CHAT-STORE] Loaded ${parsedMessages.length} messages for chat:`, id);
      
    } catch (error) {
      console.error('[CHAT-STORE] Failed to switch to chat:', error);
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
      console.log('[CHAT-STORE] No recent chats to preload');
      return;
    }
    
    console.log(`[CHAT-STORE] Preloading ${recentChats.length} recent chats`);
    
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
        
        console.log(`[CHAT-STORE] Preloaded ${parsedMessages.length} messages for chat:`, chat.id);
      } catch (error) {
        console.warn(`[CHAT-STORE] Failed to preload chat ${chat.id}:`, error);
      }
    });
    
    await Promise.allSettled(loadPromises);
    console.log('[CHAT-STORE] Preloading complete');
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
      console.error('Failed to update chat title:', error);
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
      
      console.log('[CHAT-STORE] Generated title:', result.title);
    } catch (error) {
      console.error('Failed to generate chat title:', error);
      throw error;
    }
  },

  loadPinnedChats: async () => {
    const { pinnedChatsLoaded } = get();
    
    if (pinnedChatsLoaded) {
      return;
    }
    
    try {
      console.log('[CHAT-STORE] Loading pinned chats...');
      const pinnedChats = await api.getUserPinnedChats();
      
      set({ 
        pinnedChats,
        pinnedChatsLoaded: true 
      });
      
      console.log('[CHAT-STORE] Loaded pinned chats:', pinnedChats);
    } catch (error) {
      console.error('Failed to load pinned chats:', error);
      set({ pinnedChats: [], pinnedChatsLoaded: true });
    }
  },

  pinChat: async (chatId: string) => {
    const { pinnedChats } = get();
    
    // Optimistic update - add to pinned chats immediately
    const optimisticPinnedChats = [...pinnedChats, chatId];
    set({ pinnedChats: optimisticPinnedChats });
    
    console.log('[CHAT-STORE] Optimistically pinned chat:', chatId);
    
    try {
      // Call API in background
      const updatedPinnedChats = await api.pinChat(chatId);
      
      // Update with server response (in case server has different state)
      set({ pinnedChats: updatedPinnedChats });
      
      console.log('[CHAT-STORE] Chat pinned successfully confirmed by server:', chatId);
    } catch (error) {
      console.error('Failed to pin chat, reverting:', error);
      
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
    
    console.log('[CHAT-STORE] Optimistically unpinned chat:', chatId);
    
    try {
      // Call API in background
      const updatedPinnedChats = await api.unpinChat(chatId);
      
      // Update with server response (in case server has different state)
      set({ pinnedChats: updatedPinnedChats });
      
      console.log('[CHAT-STORE] Chat unpinned successfully confirmed by server:', chatId);
    } catch (error) {
      console.error('Failed to unpin chat, reverting:', error);
      
      // Revert optimistic update on error
      set({ pinnedChats });
      
      throw error;
    }
  },

  deleteChat: async (chatId: string) => {
    try {
      console.log('[CHAT-STORE] Deleting chat:', chatId);
      
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
      
      console.log('[CHAT-STORE] Chat deleted successfully:', chatId);
    } catch (error) {
      console.error('Failed to delete chat:', error);
      throw error;
    }
  },

  branchChatFromMessage: async (chatId: string, messageId: string) => {
    try {
      console.log('[CHAT-STORE] Branching chat from message:', { chatId, messageId });
      
      const result = await api.branchChatFromMessage(chatId, messageId);
      const newChat = parseChat(result.chat);
      
      // Add the new branched chat to the store
      set(state => ({
        chats: [newChat, ...state.chats]
      }));
      
      console.log('[CHAT-STORE] Chat branched successfully:', newChat.id);
      
      return newChat.id;
    } catch (error) {
      console.error('Failed to branch chat:', error);
      throw error;
    }
  },
})); 