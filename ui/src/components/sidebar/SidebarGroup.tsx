import { Pin } from "lucide-react";
import type { Chat } from '@/types/chat';
import { SidebarItem } from "./SidebarItem";

interface SidebarGroupProps {
  title: string;
  chats: Chat[];
  isPinnedSection?: boolean;
  currentChatId?: string | null;
  loadingChatId?: string | null;
  pinnedChatIds: Set<string>;
  onChatClick: (chatId: string) => void;
  onPinToggle: (chatId: string, isPinned: boolean, e: React.MouseEvent) => void;
  onDeleteChat: (chatId: string) => Promise<void>;
  onRenameChat: (chatId: string, newTitle: string) => Promise<void>;
}

export function SidebarGroup({
  title,
  chats,
  isPinnedSection = false,
  currentChatId,
  loadingChatId,
  pinnedChatIds,
  onChatClick,
  onPinToggle,
  onDeleteChat,
  onRenameChat
}: SidebarGroupProps) {
  if (chats.length === 0) return null;

  return (
    <div className="space-y-1 mb-4">
      <h4 className="text-xs font-medium text-muted-foreground px-2 py-1 flex items-center">
        {isPinnedSection && <Pin className="h-3 w-3 mr-1" />}
        {title}
      </h4>
      
      {chats.map((chat) => (
        <SidebarItem
          key={chat.id}
          chat={chat}
          isActive={currentChatId === chat.id}
          isLoading={loadingChatId === chat.id}
          isPinned={pinnedChatIds.has(chat.id)}
          onChatClick={onChatClick}
          onPinToggle={onPinToggle}
          onDeleteChat={onDeleteChat}
          onRenameChat={onRenameChat}
        />
      ))}
    </div>
  );
} 