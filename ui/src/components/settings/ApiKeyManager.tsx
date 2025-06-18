import { useState, useEffect } from 'react';
import { Eye, EyeOff, Trash2, Check, X, Info, ExternalLink, Bot, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserApiKeyService, type ApiKeyStatus } from '@/services/userApiKeyService';
import { toast } from 'sonner';

interface ApiKeyState {
  apiKey: string;
  showApiKey: boolean;
  isLoading: boolean;
  isTesting: boolean;
  status: ApiKeyStatus | null;
  isLoadingStatus: boolean;
}

interface ApiKeyManagerCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
  getApiKeyLink: string;
  state: ApiKeyState;
  onUpdateState: (updates: Partial<ApiKeyState>) => void;
  onSave: (apiKey: string) => Promise<void>;
  onTest: () => Promise<void>;
  onDelete: () => Promise<void>;
  validateKey: (key: string) => boolean;
}

function ApiKeyManagerCard({
  title,
  description,
  icon: Icon,
  placeholder,
  getApiKeyLink,
  state,
  onUpdateState,
  onSave,

  onDelete,
  validateKey,
}: ApiKeyManagerCardProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const handleSaveApiKey = async () => {
    if (!state.apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    if (!validateKey(state.apiKey)) {
      toast.error(`Invalid ${title} API key format`);
      return;
    }

    try {
      onUpdateState({ isLoading: true });
      await onSave(state.apiKey.trim());
      
      // Clear the input
      onUpdateState({ apiKey: '' });
      
      toast.success('API key saved successfully!');
    } catch (error) {
      console.error('Failed to save API key:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save API key');
    } finally {
      onUpdateState({ isLoading: false });
    }
  };

  const handleDeleteApiKey = async () => {
    try {
      onUpdateState({ isLoading: true });
      await onDelete();
      toast.success('API key deleted successfully');
    } catch (error) {
      console.error('Failed to delete API key:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete API key');
    } finally {
      onUpdateState({ isLoading: false });
    }
  };

  const getStatusBadge = () => {
    if (!state.status?.hasKey) {
      return <Badge variant="secondary">No Key</Badge>;
    }
    
    if (state.status.isValid === undefined) {
      return <Badge variant="outline">Not Tested</Badge>;
    }
    
    return state.status.isValid ? (
      <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
        <Check className="w-3 h-3 mr-1" />
        Valid
      </Badge>
    ) : (
      <Badge variant="destructive">
        <X className="w-3 h-3 mr-1" />
        Invalid
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {title}
            <Popover open={activeTooltip === 'info'} onOpenChange={(open) => setActiveTooltip(open ? 'info' : null)}>
              <PopoverTrigger asChild>
                <div
                  className="flex items-center justify-center w-5 h-5 rounded bg-muted/50 hover:bg-muted cursor-pointer mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTooltip(activeTooltip === 'info' ? null : 'info');
                  }}
                >
                  <Info className="w-4 h-4 text-muted-foreground" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-80 text-sm z-[100]" side="top" align="center">
                <div className="space-y-3">
                  <h4 className="font-medium">About Bring Your Own Key (BYOK)</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Your API key is encrypted before storage</li>
                    <li>• Fallback to system key if your key fails</li>
                    <li>• You control your usage and billing</li>
                  </ul>
                  <a 
                    href={getApiKeyLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Get your API key here
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </PopoverContent>
            </Popover>
          </CardTitle>
          
          <div className="flex items-center gap-2 mt-1">
            {(!state.isLoadingStatus || state.status) && getStatusBadge()}
            {state.status?.hasKey && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteApiKey}
                disabled={state.isLoading}
                className="text-gray-400 hover:text-red-600 h-8 w-8 p-0"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <CardDescription className="mt-2">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* API Key Input with Save Button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={state.showApiKey ? 'text' : 'password'}
              value={state.apiKey}
              onChange={(e) => onUpdateState({ apiKey: e.target.value })}
              placeholder={placeholder}
              className="pr-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => onUpdateState({ showApiKey: !state.showApiKey })}
            >
              {state.showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Button
            onClick={handleSaveApiKey}
            disabled={state.isLoading || !state.apiKey.trim()}
          >
            {state.isLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiKeyManager() {
  // OpenRouter state
  const [openRouterState, setOpenRouterState] = useState<ApiKeyState>({
    apiKey: '',
    showApiKey: false,
    isLoading: false,
    isTesting: false,
    status: null,
    isLoadingStatus: true,
  });

  // OpenAI state
  const [openAIState, setOpenAIState] = useState<ApiKeyState>({
    apiKey: '',
    showApiKey: false,
    isLoading: false,
    isTesting: false,
    status: null,
    isLoadingStatus: true,
  });

  // Load API key statuses on component mount
  useEffect(() => {
    loadOpenRouterStatus();
    loadOpenAIStatus();
  }, []);

  const loadOpenRouterStatus = async () => {
    try {
      const keyStatus = await UserApiKeyService.getApiKeyStatus();
      setOpenRouterState(prev => ({ ...prev, status: keyStatus, isLoadingStatus: false }));
    } catch (error) {
      console.error('Failed to load OpenRouter API key status:', error);
      setOpenRouterState(prev => ({ ...prev, isLoadingStatus: false }));
    }
  };

  const loadOpenAIStatus = async () => {
    try {
      const keyStatus = await UserApiKeyService.getOpenAIApiKeyStatus();
      setOpenAIState(prev => ({ ...prev, status: keyStatus, isLoadingStatus: false }));
    } catch (error) {
      console.error('Failed to load OpenAI API key status:', error);
      setOpenAIState(prev => ({ ...prev, isLoadingStatus: false }));
    }
  };

  // OpenRouter handlers
  const handleSaveOpenRouter = async (apiKey: string) => {
    await UserApiKeyService.saveOpenRouterApiKey(apiKey);
    await loadOpenRouterStatus();
  };

  const handleTestOpenRouter = async () => {
    const result = await UserApiKeyService.validateApiKey();
    if (result.isValid) {
      toast.success('OpenRouter API key is valid and working!');
    } else {
      toast.error(`OpenRouter API key validation failed: ${result.message}`);
    }
    await loadOpenRouterStatus();
  };

  const handleDeleteOpenRouter = async () => {
    await UserApiKeyService.deleteOpenRouterApiKey();
    await loadOpenRouterStatus();
  };

  // OpenAI handlers
  const handleSaveOpenAI = async (apiKey: string) => {
    await UserApiKeyService.saveOpenAIApiKey(apiKey);
    await loadOpenAIStatus();
  };

  const handleTestOpenAI = async () => {
    const result = await UserApiKeyService.validateOpenAIApiKey();
    if (result.isValid) {
      toast.success('OpenAI API key is valid and working!');
    } else {
      toast.error(`OpenAI API key validation failed: ${result.message}`);
    }
    await loadOpenAIStatus();
  };

  const handleDeleteOpenAI = async () => {
    await UserApiKeyService.deleteOpenAIApiKey();
    await loadOpenAIStatus();
  };

  return (
    <div className="space-y-6">
      <ApiKeyManagerCard
        title="OpenRouter API Key"
        description="This key will be used for all text models and file uploads."
        icon={Bot}
        placeholder="sk-or-v1-..."
        getApiKeyLink="https://openrouter.ai/keys"
        state={openRouterState}
        onUpdateState={(updates) => setOpenRouterState(prev => ({ ...prev, ...updates }))}
        onSave={handleSaveOpenRouter}
        onTest={handleTestOpenRouter}
        onDelete={handleDeleteOpenRouter}
        validateKey={(key) => key.startsWith('sk-')}
      />
      
      <ApiKeyManagerCard
        title="OpenAI API Key"
        description="This key will be used for image generation using the gpt-image-1 model."
        icon={Image}
        placeholder="sk-..."
        getApiKeyLink="https://platform.openai.com/api-keys"
        state={openAIState}
        onUpdateState={(updates) => setOpenAIState(prev => ({ ...prev, ...updates }))}
        onSave={handleSaveOpenAI}
        onTest={handleTestOpenAI}
        onDelete={handleDeleteOpenAI}
        validateKey={(key) => key.startsWith('sk-')}
      />
    </div>
  );
} 