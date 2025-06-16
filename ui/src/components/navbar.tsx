import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { Menu, MessageSquare } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { ModeToggle } from "@/components/mode-toggle";
import { Link } from "react-router-dom";

export function Navbar() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 flex items-center h-12 px-2 border-b shrink-0 bg-background">
      <div className="flex items-center">
        <SidebarTrigger className="size-8">
          <Menu className="w-5 h-5" />
        </SidebarTrigger>
        <span className="font-semibold ml-3">My App</span>
      </div>
      <div className="flex items-center gap-3 ml-auto">
        {user && (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/chat" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat
              </Link>
            </Button>
            <span className="text-sm">
              Welcome, {user.displayName || user.email}
            </span>
          </>
        )}
        <ModeToggle />
        {user && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut(auth)}
          >
            Sign Out
          </Button>
        )}
      </div>
    </header>
  );
} 