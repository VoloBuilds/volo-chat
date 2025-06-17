import { Sparkles, Search, Code, GraduationCap } from 'lucide-react';
import { Button } from '../ui/button';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../lib/auth-context';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const quickPrompts = [
  "Write a short story about a robot discovering emotions",
  "Help me outline a sci-fi novel set in a post-apocalyptic world", 
  "Create a character profile for a complex villain with sympathetic motives",
  "Give me 5 creative writing prompts for flash fiction"
];

const categoryPrompts = {
  Create: [
    "Write a short story about a robot discovering emotions",
    "Create a character profile for a complex villain with sympathetic motives", 
    "Help me brainstorm ideas for a new art project",
    "Design a logo and brand identity for a coffee shop"
  ],
  Explore: [
    "What are some fascinating mysteries of the deep ocean?",
    "Explain the concept of parallel universes in simple terms",
    "What would happen if gravity suddenly became half as strong?",
    "Tell me about ancient civilizations that mysteriously disappeared"
  ],
  Code: [
    "Help me build a todo app in React with TypeScript",
    "Explain the difference between REST and GraphQL APIs",
    "Show me how to implement authentication in a web app",
    "What are the best practices for database design?"
  ],
  Learn: [
    "Teach me the basics of quantum physics",
    "How do neural networks actually work?",
    "What's the history behind the Renaissance period?",
    "Explain machine learning in simple terms"
  ]
};

const categoryButtons = [
  { icon: Sparkles, label: "Create" },
  { icon: Search, label: "Explore" },
  { icon: Code, label: "Code" },
  { icon: GraduationCap, label: "Learn" },
];

export function EmptyChatWelcome() {
  const { createChat } = useChat();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  // Get user's display name or first name from email
  const getUserName = () => {
    if (!user) return 'there';
    
    if (user.displayName) {
      return user.displayName.split(' ')[0]; // Get first name
    }
    
    if (user.email) {
      return user.email.split('@')[0]; // Get username from email
    }
    
    return 'there';
  };

  const handlePromptClick = async (prompt: string) => {
    if (isCreatingChat) return; // Prevent double-clicks
    
    try {
      setIsCreatingChat(true);
      console.log('[EMPTY-CHAT-WELCOME] Creating new chat with prompt:', prompt);
      
      // Create the chat and get the ID
      const newChatId = await createChat();
      console.log('[EMPTY-CHAT-WELCOME] New chat created:', newChatId);

      // Navigate to the new chat URL
      navigate(`/chat/${newChatId}`);

      // Send the message using store directly
      console.log('[EMPTY-CHAT-WELCOME] Sending initial message to chat:', newChatId);
      const { useChatStore } = await import('../../stores/chatStore');
      const { sendMessage } = useChatStore.getState();
      await sendMessage(newChatId, prompt);
      console.log('[EMPTY-CHAT-WELCOME] Initial message sent successfully');
      
    } catch (error) {
      console.error('[EMPTY-CHAT-WELCOME] Failed to start new chat:', error);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(selectedCategory === category ? null : category);
  };

  const currentPrompts = selectedCategory 
    ? categoryPrompts[selectedCategory as keyof typeof categoryPrompts] 
    : quickPrompts;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-3xl mx-auto">
        {/* Simple greeting */}
        <h1 className="text-4xl font-medium mb-2 text-foreground">
          Hi {getUserName()}
        </h1>
        
        <p className="text-lg text-muted-foreground mb-12">
          What can I help you with today?
        </p>
        
        {/* Category selection - always visible */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8 px-4">
          {categoryButtons.map(({ icon: Icon, label }) => (
            <Button
              key={label}
              onClick={() => handleCategoryClick(label)}
              variant={selectedCategory === label ? "default" : "outline"}
              className="px-4 py-3 sm:px-6 text-sm sm:text-base border"
              disabled={isCreatingChat}
            >
              <Icon className="w-4 h-4 mr-2" />
              {label}
            </Button>
          ))}
        </div>
        
        {/* Prompt suggestions */}
        <div className="space-y-1 w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl mx-auto px-4 sm:px-6 md:px-8">
          {currentPrompts.map((prompt, index) => (
            <div key={index}>
              <button
                onClick={() => handlePromptClick(prompt)}
                disabled={isCreatingChat}
                className="block w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {prompt}
              </button>
              {index < currentPrompts.length - 1 && (
                <div className="flex justify-center my-2">
                  <div className="w-full border-t border-border/50"></div>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {isCreatingChat && (
          <div className="mt-4 text-sm text-muted-foreground">
            Creating new chat...
          </div>
        )}
      </div>
    </div>
  );
} 