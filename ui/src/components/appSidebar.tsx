import { useState } from 'react';
import { 
  MessageSquare,
  Plus,
  Search,
  Loader2,
  PanelLeftClose,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChat } from '@/hooks/useChat';
import { useCurrentChat } from '@/hooks/useCurrentChat';
import { useChatStore } from '@/stores/chatStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isToday, isYesterday } from 'date-fns';
import {
  Sidebar,
  SidebarContent,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const { 
    chats, 
    chatsLoaded,
    createChat, 
    switchToChat,
    isLoading 
  } = useChat();
  
  // Get current chatId from URL
  const { chatId } = useCurrentChat();
  
  // Get loading state directly from store for real-time updates
  const { loadingChatId } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Filter chats based on search query
  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group chats by simple date categories
  const groupedChats = filteredChats.reduce((groups, chat) => {
    const date = new Date(chat.updatedAt);
    let groupKey: string;

    if (isToday(date)) {
      groupKey = 'Today';
    } else if (isYesterday(date)) {
      groupKey = 'Yesterday';
    } else {
      groupKey = 'Past Chats';
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(chat);
    return groups;
  }, {} as Record<string, typeof chats>);

  const handleNewChat = () => {
    // Navigate to the base chat URL to show EmptyChatWelcome
    navigate('/chat');
  };

  const handleChatClick = async (chatId: string) => {
    // First navigate immediately for smooth URL updates
    navigate(`/chat/${chatId}`);
    
    // Then trigger the optimized chat switch (no await to avoid blocking UI)
    switchToChat(chatId).catch((error: Error) => {
      console.error('Failed to switch to chat:', error);
    });
  };

  return (
    <Sidebar collapsible="offcanvas" className="h-screen z-40">
      <SidebarHeader className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8 size-10"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
          <button 
            onClick={() => navigate('/chat')}
            className="text-lg font-semibold whitespace-nowrap overflow-hidden hover:text-muted-foreground transition-colors"
          >
            Volo Chat
          </button>
          <div className="w-8"></div> {/* Spacer for centering */}
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto">
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="space-y-2 pt-2">
              {/* New chat button */}
              <div className="relative group">
                {/* Animated border */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 dark:from-blue-600 dark:via-purple-600 dark:to-blue-600 rounded-lg opacity-40 group-hover:opacity-70 dark:opacity-55 dark:group-hover:opacity-100 animate-pulse"></div>
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 dark:from-blue-500 dark:via-purple-500 dark:to-blue-500 rounded-lg animate-spin-slow opacity-15 dark:opacity-20"></div>
                
                <Button
                  onClick={handleNewChat}
                  disabled={isLoading}
                  className="relative w-full justify-start bg-gradient-to-r from-slate-100 via-blue-100 to-slate-50 hover:from-slate-200 hover:via-blue-200 hover:to-slate-100 dark:from-slate-900 dark:via-blue-900 dark:to-slate-800 dark:hover:from-slate-800 dark:hover:via-blue-800 dark:hover:to-slate-700 bg-[length:200%_200%] animate-gradient-shift text-slate-800 dark:text-white border border-slate-200 dark:border-0 shadow-md hover:shadow-lg dark:shadow-lg dark:hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8"
                />
              </div>

              {/* Chats list */}
              <div className="space-y-3">
                {!chatsLoaded ? (
                  <div className="text-center py-4">
                    <div className="w-4 h-4 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-xs text-muted-foreground">Loading chats...</p>
                  </div>
                ) : Object.keys(groupedChats).length === 0 ? (
                  <div className="text-center py-4">
                    <MessageSquare className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      {searchQuery ? 'No chats found' : 'No chats yet'}
                    </p>
                  </div>
                ) : (
                  ['Today', 'Yesterday', 'Past Chats'].map(groupName => {
                    const groupChats = groupedChats[groupName];
                    if (!groupChats || groupChats.length === 0) return null;

                    return (
                      <div key={groupName} className="space-y-1">
                        <h4 className="text-xs font-medium text-muted-foreground px-2 py-1">
                          {groupName}
                        </h4>
                        
                        {groupChats.map((chat) => (
                          <SidebarMenuButton
                            key={chat.id}
                            className={cn(
                              "w-full justify-start text-left transition-colors",
                              chatId === chat.id && "bg-accent text-accent-foreground",
                              loadingChatId === chat.id && "opacity-60"
                            )}
                            onClick={() => handleChatClick(chat.id)}
                            disabled={loadingChatId === chat.id}
                          >
                            <div className="flex items-center w-full">
                              <span className="truncate text-sm flex-1">
                                {chat.title}
                              </span>
                              {loadingChatId === chat.id && (
                                <Loader2 className="h-3 w-3 animate-spin ml-2 flex-shrink-0" />
                              )}
                            </div>
                          </SidebarMenuButton>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
} 