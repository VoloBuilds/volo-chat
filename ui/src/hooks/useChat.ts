import { useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useCurrentChat } from './useCurrentChat';

export function useChat(chatId?: string) {
  const {
    availableModels,
    selectedModelId,
    chats,
    chatsLoaded,
    messages,
    streamingMessageId,
    isSidebarOpen,
    isLoading,
    loadModels,
    selectModel,
    createChat,
    switchToChat,
    sendMessage,
    updateStreamingMessage,
    setSidebarOpen,
  } = useChatStore();

  // Get current chat state from URL
  const { chatId: urlChatId, currentChat, currentMessages, isLoadingChat } = useCurrentChat();
  
  // Use the provided chatId or fall back to URL chatId
  const effectiveChatId = chatId || urlChatId;

  // Calculate the final currentMessages to return
  const finalCurrentMessages = effectiveChatId ? messages[effectiveChatId] || [] : [];
  
  // Check if currently streaming
  const isStreaming = streamingMessageId !== null;

  // Load models on mount (chats are loaded at app level)
  useEffect(() => {
    loadModels();
  }, []); // Empty dependency array to run only once

  // Switch to specific chat if we have a chatId but no messages loaded for it
  useEffect(() => {
    if (urlChatId && !messages[urlChatId] && chatsLoaded) {
      console.log(`[USE-CHAT] Loading messages for chat: ${urlChatId}`);
      switchToChat(urlChatId).catch((error: Error) => {
        console.error(`[USE-CHAT] Failed to switch to chat ${urlChatId}:`, error);
      });
    }
  }, [urlChatId, messages, chatsLoaded]);

  // Wrapper for sendMessage that handles chatId
  const sendMessageWithChatId = async (content: string, attachments?: File[], existingBlobUrls?: Map<File, string>) => {
    if (!effectiveChatId) {
      throw new Error('No chat ID available for sending message');
    }
    return sendMessage(effectiveChatId, content, attachments, existingBlobUrls);
  };

  return {
    // State - using URL-derived state when available
    availableModels,
    selectedModelId,
    chats,
    chatsLoaded,
    activeChatId: effectiveChatId, // For backwards compatibility, but derived from URL
    currentMessages: finalCurrentMessages,
    currentChat,
    isSidebarOpen,
    isLoading,
    isLoadingChat,
    isStreaming,
    
    // Actions
    selectModel,
    createChat,
    switchToChat,
    sendMessage: sendMessageWithChatId, // Wrapped to handle chatId
    updateStreamingMessage,
    setSidebarOpen,
  };
} 