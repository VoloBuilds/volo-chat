import { useParams } from 'react-router-dom';
import { ChatLayout } from '../components/chat/ChatLayout';
import { ChatArea } from '../components/chat/ChatArea';
import { useChat } from '../hooks/useChat';

export function Chat() {
  const { chatId } = useParams<{ chatId?: string }>();
  
  // The useChat hook already handles chat switching based on chatId
  // No need for additional useEffect here
  useChat(chatId);

  return (
    <ChatLayout>
      <ChatArea />
    </ChatLayout>
  );
} 