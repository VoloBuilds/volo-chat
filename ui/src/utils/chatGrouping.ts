import { isToday, isYesterday } from 'date-fns';
import type { Chat } from '@/types/chat';

export interface GroupedChats {
  [groupName: string]: Chat[];
}

export function groupChatsByDate(chats: Chat[]): GroupedChats {
  return chats.reduce((groups, chat) => {
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
  }, {} as GroupedChats);
}

export function filterChats(chats: Chat[], searchQuery: string): Chat[] {
  if (!searchQuery) return chats;
  return chats.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
}

export function separatePinnedChats(chats: Chat[], pinnedChatIds: Set<string>) {
  const pinned = chats.filter(chat => pinnedChatIds.has(chat.id));
  const unpinned = chats.filter(chat => !pinnedChatIds.has(chat.id));
  return { pinned, unpinned };
} 