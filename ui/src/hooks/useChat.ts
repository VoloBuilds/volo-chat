import { useEffect, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useCurrentChat } from './useCurrentChat';

export function useChat(chatId?: string) {
  const {
    availableModels,
    selectedModelId,
    chats,
    chatsLoaded,
    pinnedChats,
    pinnedChatsLoaded,
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
    loadPinnedChats,
    pinChat,
    unpinChat,
    deleteChat,
    updateChatTitle,
  } = useChatStore();

  // Get current chat state from URL
  const { chatId: urlChatId, currentChat, currentMessages, isLoadingChat } = useCurrentChat();
  
  // Use the provided chatId or fall back to URL chatId
  const effectiveChatId = chatId || urlChatId;

  // Calculate the final currentMessages to return - memoized for performance
  const finalCurrentMessages = useMemo(() => {
    return effectiveChatId ? messages[effectiveChatId] || [] : [];
  }, [effectiveChatId, messages]);
  
  // Check if currently streaming - memoized
  const isStreaming = useMemo(() => {
    return streamingMessageId !== null;
  }, [streamingMessageId]);

  // Load models and pinned chats on mount (chats are loaded at app level)
  useEffect(() => {
    loadModels();
    loadPinnedChats();
  }, []); // Empty dependency array to run only once

  // Switch to specific chat if we have a chatId but no messages loaded for it
  useEffect(() => {
    if (urlChatId && !messages[urlChatId] && chatsLoaded) {
      console.log(`[USE-CHAT] Loading messages for chat: ${urlChatId}`);
      switchToChat(urlChatId).catch((error: Error) => {
        console.error(`[USE-CHAT] Failed to switch to chat ${urlChatId}:`, error);
      });
    }
  }, [urlChatId, chatsLoaded]); // Remove 'messages' dependency to prevent loops

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
    pinnedChats,
    pinnedChatsLoaded,
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
    pinChat,
    unpinChat,
    deleteChat,
    updateChatTitle,
  };
} 