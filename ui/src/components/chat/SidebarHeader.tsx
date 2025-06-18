import { Plus, PanelLeftClose } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from '@/components/ui/button';
import { useSidebar } from "@/components/ui/sidebar";
import { ChatSearch } from "../sidebar/ChatSearch";

interface SidebarHeaderProps {
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNewChat: () => void;
}

export function SidebarHeader({ 
  isLoading, 
  searchQuery, 
  onSearchChange, 
  onNewChat 
}: SidebarHeaderProps) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();

  return (
    <div className="px-4 pt-4 pb-2 space-y-3">
      {/* Top row with collapse button and title */}
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

      {/* New chat button */}
      <div className="relative group">
        {/* Animated border */}
        <div className="absolute -inset-px bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 dark:from-blue-600 dark:via-purple-600 dark:to-blue-600 rounded-lg opacity-40 group-hover:opacity-70 dark:opacity-55 dark:group-hover:opacity-100 animate-pulse"></div>
        <div className="absolute -inset-px bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 dark:from-blue-500 dark:via-purple-500 dark:to-blue-500 rounded-lg animate-spin-slow opacity-15 dark:opacity-20"></div>
        
        <Button
          onClick={onNewChat}
          disabled={isLoading}
          variant="outline"
          className="relative w-full justify-start bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 shadow-md hover:shadow-lg dark:shadow-lg dark:hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Search */}
      <ChatSearch 
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />
    </div>
  );
} 