import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { PanelLeftOpen, Settings, LogOut, Sun, Moon, Plus, User } from "lucide-react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "next-themes";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Navbar() {
  const { user, isAnonymous, signOutExplicitly } = useAuth();
  const { theme, setTheme } = useTheme();
  const { state, isMobile, openMobile } = useSidebar();
  const navigate = useNavigate();

  // Show expand button logic:
  // - In mobile: always show when mobile sidebar is closed
  // - In desktop: show when sidebar is collapsed
  const showExpandButton = isMobile ? !openMobile : state === "collapsed";

  const handleNewChat = () => {
    // Navigate to the base chat URL to show EmptyChatWelcome
    navigate('/chat');
  };

  const handleLoginClick = () => {
    navigate('/login');
  };

  const getUserInitials = (user: any) => {
    if (user?.displayName) {
      return user.displayName
        .split(' ')
        .map((name: string) => name[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'A'; // 'A' for Anonymous
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleSignOut = async () => {
    try {
      await signOutExplicitly();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <TooltipProvider>
      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 pointer-events-none">
        {/* Gradient shadow overlay for mobile */}
        {isMobile && (
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background via-background/70 to-transparent pointer-events-none" />
        )}
        {/* Left side - Sidebar trigger and New Chat button (only show when collapsed) */}
        {showExpandButton && (
          <div className="pointer-events-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="size-10 bg-background/80 backdrop-blur-sm border shadow-lg hover:bg-background/90 transition-colors"/>
              </TooltipTrigger>
              <TooltipContent>
                <p>Expand Sidebar</p>
              </TooltipContent>
            </Tooltip>
            
            {/* New Chat button with animated gradient border */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative group">
                  {/* Animated border */}
                  <div className="absolute -inset-px bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 dark:from-blue-600 dark:via-purple-600 dark:to-blue-600 rounded-lg opacity-40 group-hover:opacity-70 dark:opacity-55 dark:group-hover:opacity-100 animate-pulse"></div>
                  <div className="absolute -inset-px bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 dark:from-blue-500 dark:via-purple-500 dark:to-blue-500 rounded-lg animate-spin-slow opacity-15 dark:opacity-20"></div>
                  
                  <Button
                    onClick={handleNewChat}
                    variant="outline"
                    size="icon"
                    className="relative size-10 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 shadow-md hover:shadow-lg dark:shadow-lg dark:hover:shadow-xl transition-all duration-200"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>New Chat</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

      {/* Spacer when sidebar is expanded */}
      {!showExpandButton && <div></div>}

      {/* Right side - User controls */}
      {user && (
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Login button for anonymous users */}
          {isAnonymous && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleLoginClick}
                  variant="outline"
                  size="sm"
                  className="bg-background/80 backdrop-blur-sm border shadow-lg hover:bg-background/90 transition-colors"
                >
                  <User className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create a permanent account</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* User avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative size-10 rounded-full bg-background/80 backdrop-blur-sm border shadow-lg hover:bg-background/90 transition-colors p-0"
              >
                <Avatar className="size-8">
                  <AvatarImage src={user?.photoURL || ""} alt={user?.displayName || user?.email || "Anonymous User"} />
                  <AvatarFallback className="text-sm font-medium">
                    {getUserInitials(user)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium leading-none">
                  {isAnonymous ? "Anonymous User" : (user.displayName || "User")}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {isAnonymous ? "Temporary account" : user.email}
                </p>
              </div>
              <DropdownMenuSeparator />
              
              {/* Create Account option for anonymous users */}
              {isAnonymous && (
                <>
                  <DropdownMenuItem onClick={handleLoginClick} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Create Account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              
              <DropdownMenuItem asChild>
                <Link to="/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                {theme === "dark" ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Moon className="mr-2 h-4 w-4" />
                )}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleSignOut} 
                className="cursor-pointer text-red-600 focus:text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {isAnonymous ? "Start Over" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </header>
    </TooltipProvider>
  );
} 