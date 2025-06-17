import { useState, useMemo } from 'react';
import { useChat } from '../../hooks/useChat';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Badge } from '../ui/badge';
import { 
  Check, 
  ChevronDown, 
  Bot, 
  Search, 
  Eye, 
  Globe, 
  FileText, 
  Brain, 
  Code, 
  Calculator,
  Sparkles,
  Diamond,
  Zap,
  Volume2,
  Video,
  Wrench,
  Users,
  Info
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AIModel } from '../../types/chat';

// Recommended models list - these will be shown by default (matching the screenshot)
// Using more flexible matching patterns to catch variations in model naming
const RECOMMENDED_MODELS = [
  { pattern: 'gemini.*2\.?5.*flash', name: 'Gemini 2.5 Flash' },
  { pattern: 'gemini.*2\.?5.*pro', name: 'Gemini 2.5 Pro' },
  { pattern: 'gpt.*image|dalle|imagegen', name: 'GPT ImageGen' },
  { pattern: 'o1.*mini|o4.*mini', name: 'o4-mini' },
  { pattern: 'claude.*4.*sonnet(?!.*reasoning|.*thinking)', name: 'Claude 4 Sonnet' },
  { pattern: 'claude.*4.*sonnet.*(reasoning|thinking)', name: 'Claude 4 Sonnet (Reasoning)' },
  { pattern: 'deepseek.*r1.*(llama|distilled)', name: 'DeepSeek R1 (Llama Distilled)' },
];

export function ModelSelector() {
  const { availableModels, selectedModelId, selectModel } = useChat();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const selectedModel = availableModels.find(model => model.id === selectedModelId);

  // Filter and categorize models
  const { recommendedModels, filteredModels } = useMemo(() => {
    const recommended: AIModel[] = [];
    
    // Match models against recommended patterns in order
    for (const { pattern, name } of RECOMMENDED_MODELS) {
      const regex = new RegExp(pattern, 'i');
      const matchedModel = availableModels.find(model => 
        regex.test(model.name) || 
        regex.test(model.id) || 
        regex.test(model.description)
      );
      
      if (matchedModel && !recommended.find(m => m.id === matchedModel.id)) {
        recommended.push(matchedModel);
      }
    }
    
    // Limit to 7 models max
    const finalRecommended = recommended.slice(0, 7);

    if (!search) {
      return {
        recommendedModels: finalRecommended,
        filteredModels: showAll ? availableModels : finalRecommended
      };
    }

    const searchLower = search.toLowerCase();
    const filtered = availableModels.filter(model =>
      model.name.toLowerCase().includes(searchLower) ||
      model.description.toLowerCase().includes(searchLower) ||
      model.provider.toLowerCase().includes(searchLower) ||
      model.capabilities.some(cap => cap.toLowerCase().includes(searchLower))
    );

    return {
      recommendedModels: recommended,
      filteredModels: filtered
    };
  }, [availableModels, search, showAll]);

  const getProviderIcon = (provider: string, originalProvider?: string) => {
    // Use original provider for OpenRouter models when available
    const iconProvider = originalProvider || provider;
    
    switch (iconProvider) {
      case 'openai':
        return '🤖';
      case 'anthropic':
        return '🔮';
      case 'google':
        return '🌟';
      case 'deepseek':
        return '🔍';
      case 'openrouter':
        return '🌐';
      default:
        return '🤖';
    }
  };

  const getCapabilityIcon = (capability: string) => {
    switch (capability.toLowerCase()) {
      case 'vision':
        return Eye;
      case 'web':
      case 'browsing':
        return Globe;
      case 'reasoning':
      case 'thinking':
      case 'extended-thinking':
        return Brain;
      case 'analysis':
        return Sparkles;
      default:
        return null; // Don't show icons for other capabilities
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

  const displayedModels = search || showAll ? filteredModels : recommendedModels;

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
              <span className="text-sm">{getProviderIcon(selectedModel.provider, selectedModel.originalProvider)}</span>
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
      
      <PopoverContent className="w-[480px] p-0" align="end">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search models..."
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No models found.</CommandEmpty>
            
            {!search && !showAll && (
              <CommandGroup heading="Recommended">
                {displayedModels.map((model) => (
                  <ModelItem
                    key={model.id}
                    model={model}
                    isSelected={selectedModelId === model.id}
                    onSelect={() => {
                      selectModel(model.id);
                      setOpen(false);
                    }}
                    getProviderIcon={getProviderIcon}
                    getCapabilityIcon={getCapabilityIcon}
                  />
                ))}
              </CommandGroup>
            )}
            
            {(search || showAll) && (
              <CommandGroup heading={search ? "Search Results" : "All Models"}>
                {displayedModels.map((model) => (
                  <ModelItem
                    key={model.id}
                    model={model}
                    isSelected={selectedModelId === model.id}
                    onSelect={() => {
                      selectModel(model.id);
                      setOpen(false);
                    }}
                    getProviderIcon={getProviderIcon}
                    getCapabilityIcon={getCapabilityIcon}
                  />
                ))}
              </CommandGroup>
            )}
            
            {!search && !showAll && (
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll(true)}
                  className="w-full justify-start text-muted-foreground h-8"
                >
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Show all
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ModelItemProps {
  model: AIModel;
  isSelected: boolean;
  onSelect: () => void;
  getProviderIcon: (provider: string, originalProvider?: string) => string;
  getCapabilityIcon: (capability: string) => React.ComponentType<any> | null;
}

function ModelItem({ model, isSelected, onSelect, getProviderIcon, getCapabilityIcon }: ModelItemProps) {
  // Show primary capabilities as icons
  const primaryCapabilities = model.capabilities.slice(0, 4);
  
  return (
    <CommandItem
      value={`${model.id} ${model.name} ${model.description} ${model.capabilities.join(' ')}`}
      onSelect={onSelect}
      disabled={!model.isAvailable}
      className="p-3"
    >
      <div className="flex items-center gap-3 w-full">
        {/* Provider icon */}
        <div className="flex-shrink-0">
          <span className="text-lg">{getProviderIcon(model.provider, model.originalProvider)}</span>
        </div>
        
        {/* Model info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{model.name}</span>
            {model.description && (
              <div
                className="flex items-center justify-center w-4 h-4 rounded-full bg-muted/50 hover:bg-muted cursor-help"
                title={model.description}
              >
                <Info className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
            )}
            {!model.isAvailable && (
              <Badge variant="secondary" className="text-xs h-4">Unavailable</Badge>
            )}
          </div>
        </div>
        
        {/* Capability icons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {primaryCapabilities.map((capability) => {
            const IconComponent = getCapabilityIcon(capability);
            if (!IconComponent) return null; // Skip capabilities without icons
            
            return (
              <div
                key={capability}
                className="flex items-center justify-center w-5 h-5 rounded bg-muted/50"
                title={capability}
              >
                <IconComponent className="h-3 w-3 text-muted-foreground" />
              </div>
            );
          }).filter(Boolean)}
          {model.capabilities.length > 4 && (
            <div className="flex items-center justify-center w-5 h-5 rounded bg-muted/50 text-xs text-muted-foreground">
              +{model.capabilities.length - 4}
            </div>
          )}
        </div>
        
        {/* Selection indicator */}
        {isSelected && (
          <Check className="h-4 w-4 text-primary flex-shrink-0" />
        )}
      </div>
    </CommandItem>
  );
} 