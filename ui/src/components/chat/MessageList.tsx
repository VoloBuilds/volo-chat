import { useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { MessageBubble } from './MessageBubble';
import { ScrollArea } from '../ui/scroll-area';

// Bobbing dots component for minimal typing indicator
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-2 py-4">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"></div>
      </div>
    </div>
  );
}

export function MessageList() {
  const { currentMessages, isStreaming, isLoadingChat } = useChat();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, isStreaming]);

  // Show loading state when switching chats
  if (isLoadingChat) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (currentMessages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No messages yet</p>
          <p className="text-sm text-muted-foreground">
            Start the chat by sending a message below
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" ref={scrollAreaRef}>
      <div className="flex flex-col gap-4 p-4">
        {currentMessages.map((message, index) => (
          <MessageBubble 
            key={message.id}
            message={message}
            isLast={index === currentMessages.length - 1}
          />
        ))}
        
        {/* Minimal bobbing dots indicator when AI is about to respond */}
        {isStreaming && <TypingDots />}
        
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
} 