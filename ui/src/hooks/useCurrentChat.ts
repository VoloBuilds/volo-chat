import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';

/**
 * Hook that derives current chat state from URL parameters.
 * This replaces the pattern of using activeChatId from global state.
 * 
 * Note: We use useLocation instead of useParams because this hook
 * is called from components outside the Routes (like AppSidebar).
 */
export function useCurrentChat() {
  const location = useLocation();
  const { chats, messages, loadingChatId } = useChatStore();
  
  // Extract chatId from pathname manually since useParams doesn't work outside Routes
  const chatId = useMemo(() => {
    return location.pathname.startsWith('/chat/') 
      ? location.pathname.slice(6) // Remove '/chat/' prefix
      : undefined;
  }, [location.pathname]);
  
  // Derive all state from URL chatId - memoized for performance
  const currentChat = useMemo(() => {
    return chatId ? chats.find(c => c.id === chatId) : null;
  }, [chatId, chats]);
  
  const currentMessages = useMemo(() => {
    return chatId ? messages[chatId] || [] : [];
  }, [chatId, messages]);
  
  const isLoadingChat = useMemo(() => {
    return chatId ? loadingChatId === chatId : false;
  }, [chatId, loadingChatId]);
  
  return { 
    chatId, 
    currentChat, 
    currentMessages,
    isLoadingChat,
    // Helper for checking if we're on welcome screen
    isWelcomeScreen: !chatId
  };
} 