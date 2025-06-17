import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { EmptyChatWelcome } from './EmptyChatWelcome';

export function ChatArea() {
  const { chatId } = useParams<{ chatId?: string }>();
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [scrollToBottom, setScrollToBottom] = useState<(() => void) | null>(null);

  // Show welcome if URL has no chatId
  const showWelcome = !chatId;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Main chat area with flexbox layout */}
      <div className="flex-1 min-h-0 flex flex-col">
        {showWelcome ? (
          <EmptyChatWelcome />
        ) : (
          <MessageList 
            onScrollStateChange={(showButton, scrollFn) => {
              setShowScrollButton(showButton);
              setScrollToBottom(() => scrollFn);
            }} 
          />
        )}
      </div>
      
      {/* Overlay ChatInput */}
      <ChatInput 
        showScrollButton={showScrollButton}
        onScrollToBottom={scrollToBottom || undefined}
      />
    </div>
  );
} 