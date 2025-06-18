import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { api } from '../../lib/serverComm';
import { ChatMetadata, Chat } from '../../types/chat';

interface ChatBranchInfoProps {
  chatId: string;
}

export function ChatBranchInfo({ chatId }: ChatBranchInfoProps) {
  const [metadata, setMetadata] = useState<ChatMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadMetadata = async () => {
    try {
      setLoading(true);
      const data = await api.getChatMetadata(chatId);
      setMetadata(data);
    } catch (error) {
      console.error('Failed to load chat metadata:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, [chatId]);

  // Listen for branch creation events to refresh metadata
  useEffect(() => {
    const handleBranchCreated = () => {
      loadMetadata();
    };

    window.addEventListener('branch-created', handleBranchCreated);
    return () => window.removeEventListener('branch-created', handleBranchCreated);
  }, []);

  if (loading || !metadata) return null;

  const { chat, originalChat, branches, isBranched, hasOriginal, branchCount } = metadata;

  // Don't show anything if this is a regular chat with no branches
  if (!isBranched && branchCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {/* Show if this is a branched chat */}
      {isBranched && hasOriginal && originalChat && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50/80 hover:bg-blue-100/80 dark:bg-blue-950/60 dark:hover:bg-blue-950/80 backdrop-blur-sm rounded-t-lg rounded-b-none"
          onClick={() => navigate(`/chat/${originalChat.id}`)}
        >
          <GitBranch className="h-3 w-3 mr-1" />
          branched (see original)
        </Button>
      )}

      {/* Show if this chat has branches - removed the !isBranched condition */}
      {branchCount > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50/80 hover:bg-blue-100/80 dark:bg-blue-950/60 dark:hover:bg-blue-950/80 backdrop-blur-sm rounded-t-lg rounded-b-none"
            >
              <GitBranch className="h-3 w-3 mr-1" />
              {branchCount} {branchCount === 1 ? 'branch' : 'branches'}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="min-w-96 max-w-none">
            {branches.slice(0, 10).map((branch: Chat) => (
              <DropdownMenuItem
                key={branch.id}
                onClick={() => navigate(`/chat/${branch.id}`)}
                className="px-3 py-2"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium truncate flex-1 mr-3">
                    {branch.title}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(branch.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
            {branchCount > 10 && (
              <DropdownMenuItem disabled className="px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  ...and {branchCount - 10} more
                </span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
} 