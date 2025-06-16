import { useChat } from '../../hooks/useChat';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { Bot } from 'lucide-react';

export function ChatArea() {
  const { activeChatId } = useChat();

  // Always show the chat interface
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-muted/20">
      {/* Messages area - takes up all available space with proper bottom padding */}
      <div className="flex-1 overflow-hidden px-4 md:px-8 lg:px-16 xl:px-24">
        {activeChatId ? (
          <MessageList />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md mx-auto px-4">
              <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-2">Welcome to AI Chat</h2>
              <p className="text-muted-foreground">
                Start typing your message below to begin a chat with the AI.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky input area - stays at bottom when scrolling */}
      <div className="sticky bottom-0 left-0 right-0 z-40 px-4 md:px-8 lg:px-16 xl:px-24 pb-6 pt-4 bg-gradient-to-t from-background via-background/95 to-transparent backdrop-blur-sm border-t border-border/20">
        <div className="max-w-4xl mx-auto">
          <ChatInput />
        </div>
      </div>
    </div>
  );
} 