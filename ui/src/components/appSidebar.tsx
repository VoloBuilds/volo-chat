import { useState } from 'react';
import { 
  Settings, 
  MessageSquare,
  Plus,
  Search,
  Loader2,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useChat } from '@/hooks/useChat';
import { useChatStore } from '@/stores/chatStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isToday, isYesterday } from 'date-fns';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    chats, 
    chatsLoaded,
    activeChatId, 
    createChat, 
    switchToChat,
    isLoading 
  } = useChat();
  
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

  const handleNewChat = async () => {
    try {
      const newChatId = await createChat();
      // Navigate to the new chat
      navigate(`/chat/${newChatId}`);
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
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
    <Sidebar collapsible="icon" className="sticky top-12 h-[calc(100vh-3rem)] z-40">
      <SidebarContent className="overflow-y-auto">
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="space-y-2">
              {/* New chat button */}
              <Button
                onClick={handleNewChat}
                disabled={isLoading}
                className="w-full justify-start"
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>

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
                              activeChatId === chat.id && "bg-accent text-accent-foreground",
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" isActive={isActive('/settings')} asChild>
              <Link to="/settings">
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
} 