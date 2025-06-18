import { useEffect } from 'react';
import { LoginForm } from '@/components/login-form';
import { useAuth } from '@/lib/auth-context';
import { Navigate } from 'react-router-dom';

export function Login() {
  const { user, loading, resetSignOutFlag } = useAuth();

  // Reset the sign-out flag when login page loads
  useEffect(() => {
    resetSignOutFlag();
  }, [resetSignOutFlag]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"></div>;
  }

  // If user is already authenticated and not anonymous, redirect to chat
  if (user && !user.isAnonymous) {
    return <Navigate to="/chat" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <LoginForm />
    </div>
  );
} 