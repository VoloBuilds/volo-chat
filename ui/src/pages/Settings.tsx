import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, MessageSquare } from 'lucide-react';
import { ApiKeyManager } from '@/components/settings/ApiKeyManager';
import { CustomInstructionsService } from '@/services/customInstructionsService';
import { toast } from 'sonner';

export function Settings() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    displayName: user?.displayName || '',
    email: user?.email || '',
  });
  const [customInstructions, setCustomInstructions] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);

  // Load custom instructions on component mount
  useEffect(() => {
    loadCustomInstructions();
  }, []);

  const loadCustomInstructions = async () => {
    try {
      const instructions = await CustomInstructionsService.getCustomInstructions();
      setCustomInstructions(instructions);
    } catch (error) {
      console.error('Failed to load custom instructions:', error);
      toast.error('Failed to load custom instructions');
    }
  };

  const handleSave = () => {
    // TODO: Implement save functionality for profile
  };

  const handleSaveCustomInstructions = async () => {
    setIsSavingInstructions(true);
    try {
      await CustomInstructionsService.saveCustomInstructions(customInstructions);
      toast.success('Custom instructions saved successfully');
    } catch (error) {
      console.error('Failed to save custom instructions:', error);
      toast.error('Failed to save custom instructions');
    } finally {
      setIsSavingInstructions(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="container mx-auto p-6 max-w-4xl">
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-muted-foreground">
                  Manage your account settings and preferences.
                </p>
              </div>

              <Separator />

              {/* Profile Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Profile
                  </CardTitle>
                  <CardDescription>
                    Update your personal information and profile details.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display Name</Label>
                      <Input
                        id="displayName"
                        value={profile.displayName}
                        onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                        placeholder="Enter your display name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        placeholder="Enter your email"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Custom Instructions Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Custom Instructions
                  </CardTitle>
                  <CardDescription>
                    Set default instructions that will be included with every AI conversation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      id="customInstructions"
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="Type your instructions here..."
                      className="min-h-[120px] resize-none"
                      maxLength={5000}
                    />
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                      <span></span>
                      <span>{customInstructions.length}/5000</span>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={handleSaveCustomInstructions} 
                      disabled={isSavingInstructions}
                      className="w-full md:w-auto"
                    >
                      {isSavingInstructions ? 'Saving...' : 'Save Instructions'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* API Keys Section */}
              <ApiKeyManager />

              {/* Save Button */}
              <div className="flex justify-end pb-6">
                <Button onClick={handleSave} className="w-full md:w-auto">
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
} 