import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../hooks/useChat';
import { useSmartScroll } from '../../hooks/useSmartScroll';
import { useSidebar } from '../ui/sidebar';
import { useIsMobile } from '../../hooks/use-mobile';
import { ScrollArea } from '../ui/scroll-area';
import { MessageBubble } from './MessageBubble';

import { useCurrentChat } from '../../hooks/useCurrentChat';



interface MessageListProps {
  onScrollStateChange?: (showScrollButton: boolean, scrollToBottom: () => void) => void;
}

export function MessageList({ onScrollStateChange }: MessageListProps = {}) {
  const { currentMessages, isStreaming, isLoadingChat, retryMessage } = useChat();
  const { chatId } = useCurrentChat();
  const { open: isSidebarOpen, isMobile } = useSidebar();
  const isMobileScreen = useIsMobile();

  const navigate = useNavigate();
  const {
    scrollAreaRef,
    bottomRef,
    showScrollButton,
    scrollToBottom
  } = useSmartScroll(currentMessages, isStreaming);

  const handleBranch = async (newChatId: string) => {
    // Navigate to the new branched chat
    navigate(`/chat/${newChatId}`);
    
    // Force refresh of the branch info for this chat
    window.dispatchEvent(new CustomEvent('branch-created', { detail: { newChatId } }));
    
    // Immediately set scroll state to enable auto-scroll as messages load
    setTimeout(() => {
      scrollToBottom();
    }, 0);
    
    // Also do a smooth scroll once DOM is ready for the visual effect
    setTimeout(() => {
      scrollToBottom();
    }, 150);
  };

  const handleRetry = async (messageId: string) => {
    try {
      await retryMessage(messageId);
      // Auto-scroll to bottom when retry starts to see the new streaming response
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    } catch (error) {
      // Error handling is done in the chat store
      console.error('Failed to retry message:', error);
    }
  };

  // Notify parent about scroll state changes
  useEffect(() => {
    if (onScrollStateChange) {
      onScrollStateChange(showScrollButton, scrollToBottom);
    }
  }, [showScrollButton, scrollToBottom, onScrollStateChange]);

  // Auto-scroll to bottom when chat changes or when messages are first loaded
  useEffect(() => {
    if (chatId && currentMessages.length > 0 && !isLoadingChat) {
      // Scroll to bottom when opening any chat or when messages are loaded
      // Use the improved scrollToBottom function for consistency
      setTimeout(() => {
        scrollToBottom();
      }, 150);
    }
  }, [chatId, currentMessages.length, isLoadingChat, scrollToBottom]); // Include all dependencies

  // Note: Removed the jarring loading spinner for seamless transitions

  // Empty state
  if (currentMessages.length === 0 && !isLoadingChat) {
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
        <div className={`
          ${
            // Mobile: Use full width with minimal padding, but constrain to match ChatInput
            isMobileScreen 
              ? 'w-full px-3 max-w-full' 
              // Desktop with sidebar: Match ChatInput width (max-w-3xl when sidebar is open)
              : isSidebarOpen && !isMobile 
                ? 'max-w-3xl px-4' 
                // Desktop without sidebar: Match ChatInput width (max-w-4xl when sidebar is closed)
                : 'max-w-4xl px-4'
          } 
          mx-auto py-6 w-full
        `}>
          <div className={`space-y-8 w-full ${isMobileScreen ? 'pt-16 pb-32' : 'pb-32'}`}>
            {currentMessages.map((message, index) => {
              const isLast = index === currentMessages.length - 1;
              // Only allow retry for the last assistant message in the conversation
              const canRetry = isLast && message.role === 'assistant' && !isStreaming;
              
              return (
                <MessageBubble 
                  key={message.id}
                  message={message}
                  isFirst={index === 0}
                  canBranch={true}
                  onBranch={handleBranch}
                  canRetry={canRetry}
                  onRetry={handleRetry}
                />
              );
            })}
            
            {/* Typing indicator removed - dots now show in message bubble */}
            
            {/* Bottom anchor for auto-scroll */}
            <div ref={bottomRef} className="h-1" aria-hidden="true" />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}