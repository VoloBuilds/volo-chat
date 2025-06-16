import { useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';

export function useChat(chatId?: string) {
  const {
    availableModels,
    selectedModelId,
    chats,
    chatsLoaded,
    activeChatId,
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
    setActiveChat,
  } = useChatStore();

  // Load models on mount (chats are loaded at app level)
  useEffect(() => {
    loadModels();
  }, []); // Empty dependency array to run only once

  // Switch to specific chat if chatId is provided and different from current
  useEffect(() => {
    if (chatId && chatId !== activeChatId) {
      console.log(`[USE-CHAT] Switching to chat: ${chatId}`);
      switchToChat(chatId).catch((error: Error) => {
        console.error(`[USE-CHAT] Failed to switch to chat ${chatId}:`, error);
      });
    }
  }, [chatId, activeChatId]); // Remove switchToChat from deps to prevent re-renders

  // Get messages for the active chat
  const currentMessages = activeChatId ? messages[activeChatId] || [] : [];

  // Get current chat
  const currentChat = chats.find(c => c.id === activeChatId);

  // Check if currently streaming
  const isStreaming = streamingMessageId !== null;

  // Check if we're loading a chat that doesn't have messages yet
  const isLoadingChat = activeChatId && !messages[activeChatId] && isLoading;

  return {
    // State
    availableModels,
    selectedModelId,
    chats,
    chatsLoaded,
    activeChatId,
    currentMessages,
    currentChat,
    isSidebarOpen,
    isLoading,
    isLoadingChat,
    isStreaming,
    
    // Actions
    selectModel,
    createChat,
    switchToChat,
    sendMessage,
    updateStreamingMessage,
    setSidebarOpen,
    setActiveChat,
  };
} 