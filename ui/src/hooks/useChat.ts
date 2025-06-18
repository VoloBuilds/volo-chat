import { useEffect, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useCurrentChat } from './useCurrentChat';
import { useAuth } from '../lib/auth-context';

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
    cancelStreamingMessage,
    updateStreamingMessage,
    setSidebarOpen,
    loadPinnedChats,
    pinChat,
    unpinChat,
    deleteChat,
    updateChatTitle,
    retryMessage,
  } = useChatStore();

  // Get auth state to wait for authentication
  const { user, loading: authLoading } = useAuth();

  // Get current chat state from URL
  const { chatId: urlChatId, currentChat, isLoadingChat } = useCurrentChat();
  
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

  // Load models and pinned chats only after authentication is complete
  useEffect(() => {
    // Wait for auth to complete (either user exists or loading is done)
    if (!authLoading && user) {
      loadModels();
      loadPinnedChats();
    }
  }, [authLoading, user]); // Only run when auth state changes

  // Switch to specific chat if we have a chatId but no messages loaded for it
  useEffect(() => {
    if (urlChatId && !messages[urlChatId] && chatsLoaded) {
      switchToChat(urlChatId).catch(() => {
        // Handle error silently or implement proper error handling
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

  // Wrapper for retryMessage that handles chatId
  const retryMessageWithChatId = async (messageId: string) => {
    if (!effectiveChatId) {
      throw new Error('No chat ID available for retrying message');
    }
    return retryMessage(effectiveChatId, messageId);
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
    retryMessage: retryMessageWithChatId, // Wrapped to handle chatId
    cancelStreamingMessage,
    updateStreamingMessage,
    setSidebarOpen,
    pinChat,
    unpinChat,
    deleteChat,
    updateChatTitle,
  };
} 