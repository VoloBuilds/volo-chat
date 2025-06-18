import { useState, memo, useCallback } from 'react';
import { useNavigate } from "react-router-dom";

import { useCurrentChat } from '@/hooks/useCurrentChat';
import { useChatStore } from '@/stores/chatStore';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarHeader as CustomSidebarHeader } from '@/components/sidebar/SidebarHeader';
import { ChatList } from '@/components/chat/ChatList';

export const AppSidebar = memo(function AppSidebar() {

  const navigate = useNavigate();
  
  // Use store directly instead of useChat hook to avoid duplicate subscriptions
  const { 
    chats, 
    chatsLoaded,
    pinnedChats,
 
    switchToChat,
    isLoading,
    pinChat,
    unpinChat,
    deleteChat,
    updateChatTitle,
    loadingChatId
  } = useChatStore();
  
  // Get sidebar context for mobile control
  const { isMobile, setOpenMobile } = useSidebar();
  
  // Get current chatId from URL
  const { chatId } = useCurrentChat();
  const [searchQuery, setSearchQuery] = useState('');

  const handleNewChat = useCallback(() => {
    // Navigate to the base chat URL to show EmptyChatWelcome
    navigate('/chat');
  }, [navigate]);

  const handleChatClick = useCallback(async (chatId: string) => {
    // Optimized: Navigate first for immediate UI feedback
    navigate(`/chat/${chatId}`);
    
    // Close mobile sidebar after navigation on mobile
    if (isMobile) {
      setOpenMobile(false);
    }
    
    // Only switch if messages aren't already loaded/cached - check synchronously first
    const { messages, messageCache } = useChatStore.getState();
    if (!messages[chatId] && !messageCache[chatId]) {
      // Background load without blocking UI
      switchToChat(chatId).catch((error: Error) => {
        console.error('Failed to switch to chat:', error);
      });
    }
  }, [navigate, switchToChat, isMobile, setOpenMobile]);

  const handlePinToggle = useCallback(async (chatId: string, isPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering chat click
    try {
      if (isPinned) {
        await unpinChat(chatId);
      } else {
        await pinChat(chatId);
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      // Note: The store already handles reverting the optimistic update,
      // so we don't need to show additional error UI here
    }
  }, [pinChat, unpinChat]);

  const handleDeleteChat = useCallback(async (deleteChatId: string) => {
    try {
      await deleteChat(deleteChatId);
      // If we're currently viewing the deleted chat, navigate to chat home
      if (deleteChatId === chatId) {
        navigate('/chat');
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  }, [deleteChat, chatId, navigate]);

  const handleRenameChat = useCallback(async (chatId: string, newTitle: string) => {
    try {
      await updateChatTitle(chatId, newTitle);
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  }, [updateChatTitle]);

  return (
    <Sidebar 
      collapsible="offcanvas" 
      className="h-screen z-40"
      style={{
        transform: 'translateZ(0)', // Force hardware acceleration
        willChange: 'transform',
      }}
    >
      <SidebarHeader>
        <CustomSidebarHeader
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNewChat={handleNewChat}
        />
      </SidebarHeader>

      <SidebarContent 
        className="overflow-hidden"
        style={{
          transform: 'translateZ(0)', // Force hardware acceleration for content
        }}
      >
                 <SidebarGroup className="h-full flex flex-col p-0">
           <SidebarGroupContent className="flex-1 min-h-0 p-0">
            <ChatList
              chats={chats}
              chatsLoaded={chatsLoaded}
              pinnedChats={pinnedChats}
              searchQuery={searchQuery}
              currentChatId={chatId ?? undefined}
              loadingChatId={loadingChatId ?? undefined}
              onChatClick={handleChatClick}
              onPinToggle={handlePinToggle}
              onDeleteChat={handleDeleteChat}
              onRenameChat={handleRenameChat}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}); 