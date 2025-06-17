import { useParams } from 'react-router-dom';
import { useChatStore } from '../stores/chatStore';

/**
 * Hook that derives current chat state from URL parameters.
 * This replaces the pattern of using activeChatId from global state.
 */
export function useCurrentChat() {
  const { chatId } = useParams<{ chatId?: string }>();
  const { chats, messages, loadingChatId } = useChatStore();
  
  // Derive all state from URL chatId
  const currentChat = chatId ? chats.find(c => c.id === chatId) : null;
  const currentMessages = chatId ? messages[chatId] || [] : [];
  const isLoadingChat = chatId ? loadingChatId === chatId : false;
  
  return { 
    chatId, 
    currentChat, 
    currentMessages,
    isLoadingChat,
    // Helper for checking if we're on welcome screen
    isWelcomeScreen: !chatId
  };
} 