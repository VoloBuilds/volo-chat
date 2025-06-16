import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/serverComm';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MessageSquare, Bot, Zap, Shield } from 'lucide-react';

export function Home() {
  const { user } = useAuth();
  const [serverUserInfo, setServerUserInfo] = useState(null);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    async function fetchUserInfo() {
      if (user) {
        try {
          const data = await api.getCurrentUser();
          setServerUserInfo(data);
          setServerError('');
        } catch (error) {
          setServerError('Failed to fetch user info from server');
          console.error('Server error:', error);
        }
      }
    }
    fetchUserInfo();
  }, [user]);

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Welcome to AI Chat</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Experience the power of multiple AI models in one unified interface. 
              Chat with OpenAI, Anthropic, Google, and more.
            </p>
          </div>
          
          <div className="flex justify-center">
            <Button asChild size="lg" className="gap-2">
              <Link to="/chat">
                <MessageSquare className="h-5 w-5" />
                Start Chatting
              </Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          <div className="text-center p-6 rounded-lg border">
            <Bot className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Multiple AI Models</h3>
            <p className="text-muted-foreground">
              Access GPT-4, Claude, Gemini, and other leading AI models in one place
            </p>
          </div>
          
          <div className="text-center p-6 rounded-lg border">
            <Zap className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Real-time Streaming</h3>
            <p className="text-muted-foreground">
              Get instant responses with real-time message streaming
            </p>
          </div>
          
          <div className="text-center p-6 rounded-lg border">
            <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Secure & Private</h3>
            <p className="text-muted-foreground">
              Your chats are encrypted and stored securely
            </p>
          </div>
        </div>

        {/* Server Status */}
        {serverError ? (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-center">
            <p>{serverError}</p>
          </div>
        ) : serverUserInfo ? (
          <div className="bg-muted/50 p-4 rounded-lg max-w-md mx-auto">
            <h2 className="text-lg font-semibold mb-2 text-center">Connected to Server</h2>
            <div className="text-sm text-muted-foreground text-center">
              Status: ✅ Ready to chat
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <p>Connecting to server...</p>
          </div>
        )}
      </div>
    </div>
  );
} 