/**
 * ChatList - Virtualized Chat List Component
 * 
 * This component implements several performance optimizations:
 * 1. Virtual scrolling using @tanstack/react-virtual to only render visible items
 * 2. Flattened data structure that combines headers and chat items for efficient virtualization
 * 3. Memoized processing of chat data to avoid unnecessary re-computation
 * 4. Direct rendering of SidebarItem components instead of wrapping in ChatGroup
 * 5. Proper height estimation and measurement for smooth scrolling
 * 
 * Benefits:
 * - Handles thousands of chats without performance degradation
 * - Smooth sidebar collapse/expand animations
 * - Efficient memory usage by culling out-of-view items
 * - Responsive scrolling with proper overscan for smoother UX
 */

import { useMemo, useRef } from "react";
import { useVirtualizer } from '@tanstack/react-virtual';
import { MessageSquare, Pin } from "lucide-react";
import { SidebarItem } from "../sidebar/SidebarItem";
import { filterChats, separatePinnedChats, groupChatsByDate } from "@/utils/chatGrouping";
import type { Chat } from '@/types/chat';

interface ChatListProps {
  chats: Chat[];
  chatsLoaded: boolean;
  pinnedChats: string[];
  searchQuery: string;
  currentChatId?: string;
  loadingChatId?: string;
  onChatClick: (chatId: string) => void;
  onPinToggle: (chatId: string, isPinned: boolean, e: React.MouseEvent) => void;
  onDeleteChat: (chatId: string) => Promise<void>;
  onRenameChat: (chatId: string, newTitle: string) => Promise<void>;
}

interface VirtualListItem {
  type: 'group-header' | 'chat';
  groupTitle?: string;
  chat?: Chat;
  isPinnedSection?: boolean;
  key: string;
}

export function ChatList({
  chats,
  chatsLoaded,
  pinnedChats,
  searchQuery,
  currentChatId,
  loadingChatId,
  onChatClick,
  onPinToggle,
  onDeleteChat,
  onRenameChat
}: ChatListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Process and flatten chat data for virtualization - optimized with better dependencies
  const virtualItems = useMemo((): VirtualListItem[] => {
    if (!chatsLoaded) return [];

    const filteredChats = filterChats(chats, searchQuery);
    
    if (filteredChats.length === 0) return [];

    const pinnedChatIds = new Set(pinnedChats);
    const { pinned: pinnedChatList, unpinned: unpinnedChatList } = separatePinnedChats(filteredChats, pinnedChatIds);
    const groupedUnpinnedChats = groupChatsByDate(unpinnedChatList);

    const items: VirtualListItem[] = [];

    // Add pinned chats section
    if (pinnedChatList.length > 0) {
      items.push({
        type: 'group-header',
        groupTitle: 'Pinned',
        isPinnedSection: true,
        key: 'pinned-header'
      });
      
      pinnedChatList.forEach(chat => {
        items.push({
          type: 'chat',
          chat,
          key: `pinned-${chat.id}`
        });
      });
    }

    // Add regular chat sections
    (['Today', 'Yesterday', 'Past Chats'] as const).forEach(groupName => {
      const groupChats = groupedUnpinnedChats[groupName] || [];
      if (groupChats.length > 0) {
        items.push({
          type: 'group-header',
          groupTitle: groupName,
          key: `${groupName}-header`
        });
        
        groupChats.forEach(chat => {
          items.push({
            type: 'chat',
            chat,
            key: `${groupName}-${chat.id}`
          });
        });
      }
    });

    return items;
  }, [chats, chatsLoaded, pinnedChats, searchQuery]); // Optimized dependencies

  // Setup virtualizer with optimized sizing and performance
  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = virtualItems[index];
      // Group headers are smaller, chats are standard sidebar item height
      return item?.type === 'group-header' ? 28 : 40;
    },
    overscan: 5, // Reduced overscan for better performance with large lists
    measureElement: (element) => {
      // More accurate measurement for better virtual scrolling
      return element?.getBoundingClientRect().height ?? 40;
    },
    // Performance optimization: use fixed height when possible
    lanes: 1,
  });

  // Loading state
  if (!chatsLoaded) {
    return (
      <div className="text-center py-4">
        <div className="w-4 h-4 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-xs text-muted-foreground">Loading chats...</p>
      </div>
    );
  }

  // Empty state
  if (virtualItems.length === 0) {
    return (
      <div className="text-center py-4">
        <MessageSquare className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          {searchQuery ? 'No chats found' : 'No chats yet'}
        </p>
      </div>
    );
  }

  const pinnedChatIds = new Set(pinnedChats);

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto pl-3 pt-1"
      style={{
        contain: 'layout style paint',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = virtualItems[virtualItem.index];
          
          if (!item) return null;

          if (item.type === 'group-header') {
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <h4 className="text-xs font-medium text-muted-foreground px-3 py-2 flex items-center">
                  {item.isPinnedSection && <Pin className="h-3 w-3 mr-1" />}
                  {item.groupTitle}
                </h4>
              </div>
            );
          }

          if (item.type === 'chat' && item.chat) {
            const isActive = currentChatId === item.chat.id;
            
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="px-1"
              >
                <SidebarItem
                  chat={item.chat}
                  isActive={isActive}
                  isLoading={loadingChatId === item.chat.id}
                  isPinned={pinnedChatIds.has(item.chat.id)}
                  onChatClick={onChatClick}
                  onPinToggle={onPinToggle}
                  onDeleteChat={onDeleteChat}
                  onRenameChat={onRenameChat}
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
} 