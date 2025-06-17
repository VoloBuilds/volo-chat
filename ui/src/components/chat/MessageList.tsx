import { useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { useSmartScroll } from '../../hooks/useSmartScroll';
import { useSidebar } from '../ui/sidebar';
import { ScrollArea } from '../ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import { Loader2 } from 'lucide-react';

// Typing indicator component
function TypingIndicator() {
  return (
    <div className="flex justify-start px-4 py-3">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"></div>
      </div>
    </div>
  );
}

interface MessageListProps {
  onScrollStateChange?: (showScrollButton: boolean, scrollToBottom: () => void) => void;
}

export function MessageList({ onScrollStateChange }: MessageListProps = {}) {
  const { currentMessages, isStreaming, isLoadingChat } = useChat();
  const { open: isSidebarOpen, isMobile } = useSidebar();
  const {
    scrollAreaRef,
    bottomRef,
    isAtBottom,
    showScrollButton,
    scrollToBottom
  } = useSmartScroll(currentMessages, isStreaming);

  // Notify parent about scroll state changes
  useEffect(() => {
    if (onScrollStateChange) {
      onScrollStateChange(showScrollButton, scrollToBottom);
    }
  }, [showScrollButton, scrollToBottom, onScrollStateChange]);

  // Loading state when switching chats
  if (isLoadingChat) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (currentMessages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <p className="text-muted-foreground mb-2">No messages yet</p>
          <p className="text-sm text-muted-foreground">
            Start the conversation by sending a message below
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-0">
      {/* Scrollable messages container using ScrollArea */}
      <ScrollArea className="h-full" ref={scrollAreaRef}>
        <div className={`${isSidebarOpen && !isMobile ? 'max-w-[calc(100vw-20rem)] lg:max-w-3xl' : 'max-w-4xl'} mx-auto px-4 py-6 w-full`}>
          <div className="space-y-8 w-full pb-32">
            {currentMessages.map((message, index) => (
              <MessageBubble 
                key={message.id}
                message={message}
                isLast={index === currentMessages.length - 1}
              />
            ))}
            
            {/* Typing indicator removed - dots now show in message bubble */}
            
            {/* Bottom anchor for auto-scroll */}
            <div ref={bottomRef} className="h-8" aria-hidden="true" />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}