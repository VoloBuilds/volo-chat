import { useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '../ui/command';
import { Badge } from '../ui/badge';
import { Check, ChevronDown, Bot, Zap, DollarSign } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ModelSelector() {
  const { availableModels, selectedModelId, selectModel } = useChat();
  const [open, setOpen] = useState(false);

  const selectedModel = availableModels.find(model => model.id === selectedModelId);

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'openai':
        return '🤖';
      case 'anthropic':
        return '🔮';
      case 'google':
        return '🌟';
      case 'deepseek':
        return '🔍';
      default:
        return '🤖';
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'anthropic':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'google':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'deepseek':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const formatPrice = (price: number) => {
    if (price < 0.001) {
      return `$${(price * 1000000).toFixed(2)}/1M tokens`;
    }
    return `$${price.toFixed(3)}/1K tokens`;
  };

  if (availableModels.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-muted rounded text-xs">
        <Bot className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between h-8 text-xs"
          size="sm"
        >
          {selectedModel ? (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-sm">{getProviderIcon(selectedModel.provider)}</span>
              <span className="truncate">{selectedModel.name}</span>
              {!selectedModel.isAvailable && (
                <Badge variant="secondary" className="text-xs h-4">Unavailable</Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">Select model...</span>
          )}
          <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[400px] p-0" align="end">
        <Command>
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup heading="Available Models">
              {availableModels.map((model) => (
                <CommandItem
                  key={model.id}
                  value={model.id}
                  onSelect={() => {
                    selectModel(model.id);
                    setOpen(false);
                  }}
                  disabled={!model.isAvailable}
                  className="p-3"
                >
                  <div className="flex items-start gap-3 w-full">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-lg">{getProviderIcon(model.provider)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate text-sm">{model.name}</span>
                          <Badge 
                            variant="secondary" 
                            className={cn("text-xs h-4", getProviderColor(model.provider))}
                          >
                            {model.provider}
                          </Badge>
                          {!model.isAvailable && (
                            <Badge variant="destructive" className="text-xs h-4">
                              Unavailable
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {model.description}
                        </p>
                        
                        {/* Model stats */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            <span>{(model.contextWindow / 1000).toFixed(0)}K context</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            <span>{formatPrice(model.pricing.input)}</span>
                          </div>
                        </div>
                        
                        {/* Capabilities */}
                        {model.capabilities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {model.capabilities.slice(0, 3).map((capability) => (
                              <Badge key={capability} variant="outline" className="text-xs h-4">
                                {capability}
                              </Badge>
                            ))}
                            {model.capabilities.length > 3 && (
                              <Badge variant="outline" className="text-xs h-4">
                                +{model.capabilities.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {selectedModelId === model.id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
} 