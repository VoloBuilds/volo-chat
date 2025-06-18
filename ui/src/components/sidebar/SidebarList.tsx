import { MessageSquare } from "lucide-react";
import { SidebarGroup } from "./SidebarGroup";
import { filterChats, separatePinnedChats, groupChatsByDate } from "@/utils/chatGrouping";
import type { Chat } from '@/types/chat';

interface ChatListProps {
  chats: Chat[];
  chatsLoaded: boolean;
  pinnedChats: string[];
  searchQuery: string;
  currentChatId?: string;
  loadingChatId?: string | null;
  onChatClick: (chatId: string) => void;
  onPinToggle: (chatId: string, isPinned: boolean, e: React.MouseEvent) => void;
  onDeleteChat: (chatId: string) => Promise<void>;
  onRenameChat: (chatId: string, newTitle: string) => Promise<void>;
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
  if (!chatsLoaded) {
    return (
      <div className="text-center py-4">
        <div className="w-4 h-4 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-xs text-muted-foreground">Loading chats...</p>
      </div>
    );
  }

  const filteredChats = filterChats(chats, searchQuery);
  
  if (filteredChats.length === 0) {
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
  const { pinned: pinnedChatList, unpinned: unpinnedChatList } = separatePinnedChats(filteredChats, pinnedChatIds);
  const groupedUnpinnedChats = groupChatsByDate(unpinnedChatList);

  return (
    <div className="space-y-3 pl-1">
      {/* Pinned Chats Section */}
      <SidebarGroup
        title="Pinned"
        chats={pinnedChatList}
        isPinnedSection={true}
        currentChatId={currentChatId}
        loadingChatId={loadingChatId}
        pinnedChatIds={pinnedChatIds}
        onChatClick={onChatClick}
        onPinToggle={onPinToggle}
        onDeleteChat={onDeleteChat}
        onRenameChat={onRenameChat}
      />

      {/* Regular Chats Sections */}
      {['Today', 'Yesterday', 'Past Chats'].map(groupName => (
        <SidebarGroup
          key={groupName}
          title={groupName}
          chats={groupedUnpinnedChats[groupName] || []}
          currentChatId={currentChatId}
          loadingChatId={loadingChatId}
          pinnedChatIds={pinnedChatIds}
          onChatClick={onChatClick}
          onPinToggle={onPinToggle}
          onDeleteChat={onDeleteChat}
          onRenameChat={onRenameChat}
        />
      ))}
    </div>
  );
} 