import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemeProvider } from "@/components/theme-provider";

import { Navbar } from '@/components/navbar';
import { AppSidebar } from '@/components/sidebar/appSidebar';
import { Settings } from '@/pages/Settings';
import { Chat } from '@/pages/Chat';
import { Login } from '@/pages/Login';
import SharedChat from '@/pages/SharedChat';
import { Toaster } from '@/components/ui/sonner';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import { useChatStore } from '@/stores/chatStore';

// Layout component for authenticated routes
function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // Don't redirect while still loading or if user exists (including anonymous users)
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"></div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Navbar />
      <div className="flex flex-1">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <main className="flex-1">
            {children}
          </main>
        </SidebarInset>
      </div>
    </>
  );
}

function AppContent() {
  const { user, loading, isAnonymous } = useAuth();
  const { loadChats, clearCurrentNavigation, loadModels } = useChatStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Track previous anonymous state to detect authentication upgrades
  const [previousIsAnonymous, setPreviousIsAnonymous] = React.useState<boolean | null>(null);

  // Load models immediately when app starts (models are public, no auth needed)
  useEffect(() => {
    console.log('[APP] Loading models...');
    loadModels().catch(error => {
      console.error('[APP] Failed to load models:', error);
    });
  }, []); // Run once on app start

  // Load chats once when user is authenticated (including anonymous users)
  useEffect(() => {
    if (user) {
      console.log('[APP] User authenticated, loading chats...');
      loadChats(true); // Force load to bypass protection for now
    }
  }, [user]); // Remove loadChats from deps to prevent re-runs

  // Handle authentication state changes (anonymous -> authenticated)
  useEffect(() => {
    if (user && previousIsAnonymous !== null) {
      // User was anonymous but now is not (account upgraded)
      if (previousIsAnonymous && !isAnonymous) {
        console.log('[APP] User upgraded from anonymous to authenticated, clearing navigation state');
        
        // Clear chat state to force reload with new user's data
        clearCurrentNavigation();
        
        // If we're currently on a specific chat, navigate to chat home
        if (location.pathname.startsWith('/chat/')) {
          navigate('/chat', { replace: true });
        }
      }
    }
    
    // Update previous state for next comparison
    setPreviousIsAnonymous(isAnonymous);
  }, [user, isAnonymous, previousIsAnonymous, clearCurrentNavigation, navigate, location.pathname]);

  // Handle complete sign out (user becomes null)
  useEffect(() => {
    if (!user && !loading) {
      console.log('[APP] User signed out, clearing chat state and redirecting to login');
      clearCurrentNavigation();
      
      // Only redirect if we're not already on login or shared chat pages
      if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/shared/')) {
        navigate('/login', { replace: true });
      }
    }
  }, [user, loading, clearCurrentNavigation, navigate, location.pathname]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"></div>;
  }

  return (
    <SidebarProvider>
      <div className="flex flex-col w-full min-h-screen bg-background">
        <Routes>
          {/* Public login route */}
          <Route path="/login" element={<Login />} />
          
          {/* Public SharedChat route - accessible without authentication */}
          <Route path="/shared/:shareId" element={<SharedChat />} />
          
          {/* Authenticated routes with main app layout (includes anonymous users) */}
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
