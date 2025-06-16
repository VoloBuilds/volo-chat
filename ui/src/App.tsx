import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemeProvider } from "@/components/theme-provider";
import { LoginForm } from '@/components/login-form';
import { Navbar } from '@/components/navbar';
import { AppSidebar } from '@/components/appSidebar';
import { Settings } from '@/pages/Settings';
import { Chat } from '@/pages/Chat';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import { useChatStore } from '@/stores/chatStore';
import { useEffect } from 'react';

function AppContent() {
  const { user, loading } = useAuth();
  const { loadChats } = useChatStore();

      // Load chats once when user is authenticated
    useEffect(() => {
      if (user) {
        console.log('[APP] User authenticated, loading chats...');
        loadChats(true); // Force load to bypass protection for now
      }
    }, [user]); // Remove loadChats from deps to prevent re-runs

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"></div>;
  }

  return (
    <SidebarProvider>
      <div className="flex flex-col w-full min-h-screen bg-background">
        <Navbar />
        {!user ? (
          <main className="flex flex-col items-center justify-center flex-1 p-4">
            <LoginForm />
          </main>
        ) : (
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset className="flex-1">
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<Navigate to="/chat" replace />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/chat/:chatId" element={<Chat />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </main>
            </SidebarInset>
          </div>
        )}
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider 
        attribute="class" 
        defaultTheme="system" 
        enableSystem
        disableTransitionOnChange
        storageKey="volo-app-theme"
      >
        <Router>
          <AppContent />
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
