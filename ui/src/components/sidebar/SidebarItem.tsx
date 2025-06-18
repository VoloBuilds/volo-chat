import { useState, memo, useCallback } from 'react';
import { Loader2, GitBranch } from "lucide-react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from '@/lib/utils';
import { api } from '@/lib/serverComm';
import type { Chat } from '@/types/chat';
import { ChatActionMenu } from './ChatActionMenu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SidebarItemProps {
  chat: Chat;
  isActive: boolean;
  isLoading: boolean;
  isPinned: boolean;
  onChatClick: (chatId: string) => void;
  onPinToggle: (chatId: string, isPinned: boolean, e: React.MouseEvent) => void;
  onDeleteChat: (chatId: string) => Promise<void>;
  onRenameChat: (chatId: string, newTitle: string) => Promise<void>;
}

export const SidebarItem = memo(function SidebarItem({ 
  chat, 
  isActive, 
  isLoading, 
  isPinned, 
  onChatClick, 
  onPinToggle,
  onDeleteChat,
  onRenameChat
}: SidebarItemProps) {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(chat.title);

  const handleClick = useCallback(() => {
    onChatClick(chat.id);
  }, [onChatClick, chat.id]);

  const handlePin = useCallback(async () => {
    const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
    await onPinToggle(chat.id, isPinned, fakeEvent);
  }, [onPinToggle, chat.id, isPinned]);

  const handleRename = useCallback(async () => {
    setRenameDialogOpen(true);
    setNewTitle(chat.title);
  }, [chat.title]);

  const handleRenameSubmit = useCallback(async () => {
    if (newTitle.trim() && newTitle.trim() !== chat.title) {
      await onRenameChat(chat.id, newTitle.trim());
    }
    setRenameDialogOpen(false);
  }, [newTitle, chat.title, chat.id, onRenameChat]);

  const handleRenameCancel = useCallback(() => {
    setNewTitle(chat.title);
    setRenameDialogOpen(false);
  }, [chat.title]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  }, [handleRenameSubmit, handleRenameCancel]);

  const handleDelete = useCallback(async () => {
    await onDeleteChat(chat.id);
  }, [onDeleteChat, chat.id]);

  return (
    <>
      <div className="group/chat relative">
        <SidebarMenuButton
          className={cn(
            "w-full justify-start text-left transition-all pr-8",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary font-medium",
            isLoading && "opacity-60"
          )}
          onClick={handleClick}
          disabled={isLoading}
        >
          <div className="flex items-center w-full">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {(chat.isBranched || api.isCopiedChat(chat)) && (
                <GitBranch className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
              <span className="truncate text-sm">
                {chat.title}
              </span>
            </div>
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin ml-2 flex-shrink-0" />
            )}
          </div>
        </SidebarMenuButton>
        
        {/* Action menu - visible on hover */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/chat:opacity-100 transition-opacity">
          <ChatActionMenu
            chat={chat}
            isPinned={isPinned}
            onPin={handlePin}
            onRename={handleRename}
            onDelete={handleDelete}
            isLoading={isLoading}
            size="sm"
          />
        </div>
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter new chat title..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleRenameCancel}>
                Cancel
              </Button>
              <Button onClick={handleRenameSubmit} disabled={!newTitle.trim()}>
                Rename
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}); 