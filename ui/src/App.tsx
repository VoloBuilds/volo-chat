import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemeProvider } from "@/components/theme-provider";
import { LoginForm } from '@/components/login-form';
import { Navbar } from '@/components/navbar';
import { AppSidebar } from '@/components/sidebar/appSidebar';
import { Settings } from '@/pages/Settings';
import { Chat } from '@/pages/Chat';
import SharedChat from '@/pages/SharedChat';
import { Toaster } from '@/components/ui/sonner';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import { useChatStore } from '@/stores/chatStore';

// Layout component for authenticated routes
function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <>
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
              {children}
            </main>
          </SidebarInset>
        </div>
      )}
    </>
  );
}

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
        <Routes>
          {/* Public SharedChat route - accessible without authentication */}
          <Route path="/shared/:shareId" element={<SharedChat />} />
          
          {/* Authenticated routes with main app layout */}
          <Route path="/" element={<AppLayout><Navigate to="/chat" replace /></AppLayout>} />
          <Route path="/chat" element={<AppLayout><Chat /></AppLayout>} />
          <Route path="/chat/:chatId" element={<AppLayout><Chat /></AppLayout>} />
          <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
        </Routes>
      </div>
      <Toaster />
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
