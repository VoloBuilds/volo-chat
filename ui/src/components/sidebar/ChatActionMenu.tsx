import { useState } from 'react';
import { 
  Share2, 
  Check, 
  MoreHorizontal, 
  Trash, 
  GitBranch,
  Pin,
  PinOff,
  Edit3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Chat } from '@/types/chat';

interface ChatActionMenuProps {
  chat: Chat;
  isPinned?: boolean;
  onPin?: () => Promise<void>;
  onRename?: () => Promise<void>;
  onShare?: () => Promise<void>;
  onBranch?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onNavigateToOriginal?: () => void;
  isLoading?: boolean;
  size?: 'sm' | 'default';
}

export function ChatActionMenu({ 
  chat, 
  isPinned = false,
  onPin,
  onRename,
  onShare, 
  onBranch, 
  onDelete, 
  onNavigateToOriginal,
  isLoading,
  size = 'default'
}: ChatActionMenuProps) {
  const [actionState, setActionState] = useState<{
    pinning: boolean;
    renaming: boolean;
    sharing: boolean;
    branching: boolean;
    deleting: boolean;
    copied: boolean;
  }>({
    pinning: false,
    renaming: false,
    sharing: false,
    branching: false,
    deleting: false,
    copied: false,
  });

  const handleAction = async (
    action: 'pin' | 'rename' | 'share' | 'branch' | 'delete',
    handler?: () => Promise<void>
  ) => {
    if (!handler) return;

    const stateKey = `${action}ing` as keyof typeof actionState;
    setActionState(prev => ({ ...prev, [stateKey]: true }));

    try {
      await handler();
      
      if (action === 'share') {
        setActionState(prev => ({ ...prev, copied: true }));
        setTimeout(() => {
          setActionState(prev => ({ ...prev, copied: false }));
        }, 2000);
      }
    } catch (error) {
      toast.error(`Failed to ${action} chat. Please try again.`);
    } finally {
      setActionState(prev => ({ ...prev, [stateKey]: false }));
    }
  };

  const buttonSize = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={buttonSize} 
          disabled={isLoading}
        >
          <MoreHorizontal className={iconSize} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        
        {/* Pin/Unpin action */}
        {onPin && (
          <DropdownMenuItem 
            onClick={() => handleAction('pin', onPin)}
            disabled={actionState.pinning}
          >
            {isPinned ? (
              <PinOff className="mr-2 h-4 w-4" />
            ) : (
              <Pin className="mr-2 h-4 w-4" />
            )}
            {actionState.pinning 
              ? (isPinned ? 'Unpinning...' : 'Pinning...') 
              : (isPinned ? 'Unpin chat' : 'Pin chat')
            }
          </DropdownMenuItem>
        )}

        {/* Rename action */}
        {onRename && (
          <DropdownMenuItem 
            onClick={() => handleAction('rename', onRename)}
            disabled={actionState.renaming}
          >
            <Edit3 className="mr-2 h-4 w-4" />
            {actionState.renaming ? 'Renaming...' : 'Rename chat'}
          </DropdownMenuItem>
        )}

        {/* Separator after basic actions */}
        {(onPin || onRename) && (onShare || onBranch || onNavigateToOriginal || onDelete) && (
          <DropdownMenuSeparator />
        )}

        {/* Share action */}
        {onShare && (
          <DropdownMenuItem 
            onClick={() => handleAction('share', onShare)}
            disabled={actionState.sharing}
          >
            {actionState.copied ? (
              <Check className="mr-2 h-4 w-4 text-green-600" />
            ) : (
              <Share2 className="mr-2 h-4 w-4" />
            )}
            {chat.isShared 
              ? (actionState.copied ? 'Copied!' : 'Copy share link')
              : (actionState.sharing ? 'Sharing...' : 'Share chat')
            }
          </DropdownMenuItem>
        )}

        {/* Branch action */}
        {onBranch && (
          <DropdownMenuItem 
            onClick={() => handleAction('branch', onBranch)}
            disabled={actionState.branching}
          >
            <GitBranch className="mr-2 h-4 w-4" />
            {actionState.branching ? 'Creating branch...' : 'Branch from here'}
          </DropdownMenuItem>
        )}

        {/* Delete action */}
        {onDelete && (
          <>
            <DropdownMenuItem 
              onClick={() => handleAction('delete', onDelete)}
              disabled={actionState.deleting}
              className="text-red-600 focus:text-red-600"
            >
              <Trash className="mr-2 h-4 w-4" />
              {actionState.deleting ? 'Deleting...' : 'Delete chat'}
            </DropdownMenuItem>
          </>
        )}
        
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 