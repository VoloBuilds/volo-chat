import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { useChatStore } from '@/stores/chatStore';
import { api } from '@/lib/serverComm';
import { SharedChatResponse } from '@/types/chat';
import { Download, ArrowLeft, Share2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function SharedChat() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  
  const [sharedChat, setSharedChat] = useState<SharedChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  const importSharedChat = useChatStore(state => state.importSharedChat);

  useEffect(() => {
    if (!shareId) {
      setError('Invalid share link');
      setIsLoading(false);
      return;
    }

    const fetchSharedChat = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await api.getSharedChat(shareId);
        setSharedChat(response);
      } catch (error: any) {
        console.error('Error fetching shared chat:', error);
        if (error.status === 404) {
          setError('This shared chat does not exist or is no longer available');
        } else {
          setError('Failed to load shared chat. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchSharedChat();
  }, [shareId]);

  const handleImport = async () => {
    if (!shareId || !user) return;

    try {
      setIsImporting(true);
      
      const newChatId = await importSharedChat(shareId);
      
      toast.success('Chat imported successfully!');
      
      // Navigate to the imported chat
      navigate(`/chat/${newChatId}`);
    } catch (error: any) {
      console.error('Error importing chat:', error);
      
      if (error.message?.includes('already imported')) {
        toast.info('This chat has already been saved to your account');
      } else {
        toast.error('Failed to save chat. Please try again.');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleBackToApp = () => {
      navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-mobile-screen bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-mobile-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <CardTitle>Unable to Load Shared Chat</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={handleBackToApp}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {user ? 'Back to App' : 'Go to Login'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sharedChat) {
    return null;
  }

  return (
    <div className="min-h-mobile-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Share2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Shared Chat</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleBackToApp}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {user ? 'Back to App' : 'Go to Login'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-4">
        {/* Chat Info */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-xl">{sharedChat.chat.title}</CardTitle>
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span>{sharedChat.chat.messageCount} messages</span>
                  <span>Model: {sharedChat.chat.modelId}</span>
                  <span>
                    Shared on {new Date(sharedChat.chat.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              
              {user && !loading && (
                <Button 
                  onClick={handleImport}
                  disabled={isImporting}
                  className="ml-4"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isImporting ? 'Saving...' : 'Save Chat'}
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Authentication Notice */}
        {!user && !loading && (
          <Card className="mb-6 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <div className="h-2 w-2 bg-blue-500 rounded-full" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Sign in to import this chat
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Create an account to save this conversation to your chat history
                  </p>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="ml-auto"
                >
                  Sign In
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages */}
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <div className="max-w-3xl mx-auto py-6 px-4">
                <div className="space-y-8 w-full">
                  {sharedChat.messages.map((message, index) => (
                    <MessageBubble 
                      key={message.id}
                      message={message}
                      isFirst={index === 0}
                      canBranch={false}
                      sharedChatId={shareId}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>This is a shared conversation. {user ? 'Import it to add your own messages.' : 'Sign in to import and continue the conversation.'}</p>
        </div>
      </div>
    </div>
  );
} 