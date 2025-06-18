import { useState, useMemo, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Badge } from '../ui/badge';
import {
  TooltipProvider,
} from '../ui/tooltip';
import { 
  Check, 
  ChevronDown, 
  ChevronUp,
  Bot, 
  Eye, 
  Globe, 
  Brain, 
  Sparkles,
  Info,
  Image,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AIModel } from '../../types/chat';
import { UserApiKeyService, type ApiKeyStatus } from '../../services/userApiKeyService';

// Recommended models list - these will be shown by default
// Using exact name matching for specific models
const RECOMMENDED_MODELS = [
  'Anthropic: Claude Sonnet 4',
  'Google: Gemini 2.5 Flash',
  'Google: Gemini 2.5 Pro',
  'OpenAI: GPT-4o-mini',
  'OpenAI: o4 Mini',
  'GPT Image 1',
  'DeepSeek: R1 Distill Qwen 7B',
];

export function ModelSelector() {
  const { availableModels, selectedModelId, selectModel } = useChat();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAllModels, setShowAllModels] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [openAIApiKeyStatus, setOpenAIApiKeyStatus] = useState<ApiKeyStatus | null>(null);

  const selectedModel = availableModels.find(model => model.id === selectedModelId);

  // Load OpenAI API key status
  useEffect(() => {
    const loadOpenAIStatus = async () => {
      try {
        const status = await UserApiKeyService.getOpenAIApiKeyStatus();
        setOpenAIApiKeyStatus(status);
      } catch (error) {
        console.error('Failed to load OpenAI API key status:', error);
        setOpenAIApiKeyStatus({ hasKey: false });
      }
    };

    loadOpenAIStatus();
  }, []);

  // Helper function to assign release scores to models for sorting
  const getModelReleaseScore = (model: AIModel): number => {
    const name = model.name.toLowerCase();
    const id = model.id.toLowerCase();
    
    // Claude models (2024-2025)
    if (name.includes('claude 4') || id.includes('claude-4')) return 2025;
    if (name.includes('claude 3.7') || id.includes('claude-3-7')) return 2024.8;
    if (name.includes('claude 3.5 sonnet v2') || name.includes('claude 3.5 sonnet (v2)') || id.includes('claude-3-5-sonnet-20241022')) return 2024.7;
    if (name.includes('claude 3.5') || id.includes('claude-3-5')) return 2024.6;
    if (name.includes('claude 3') || id.includes('claude-3')) return 2024.3;
    
    // OpenAI models (2024-2025)
    if (name.includes('gpt-o1') || name.includes('o1-') || id.includes('o1-')) return 2024.9;
    if (name.includes('gpt-4o') || id.includes('gpt-4o')) return 2024.5;
    if (name.includes('gpt-4 turbo') || id.includes('gpt-4-turbo')) return 2024.4;
    if (name.includes('gpt-4') || id.includes('gpt-4')) return 2023.3;
    if (name.includes('gpt-3.5') || id.includes('gpt-3.5')) return 2022.1;
    
    // Google Gemini models (2024-2025)
    if (name.includes('gemini 2.5') || id.includes('gemini-2.5')) return 2024.95;
    if (name.includes('gemini 2.0') || id.includes('gemini-2.0')) return 2024.85;
    if (name.includes('gemini 1.5') || id.includes('gemini-1.5')) return 2024.2;
    if (name.includes('gemini') || id.includes('gemini')) return 2023.5;
    
    // DeepSeek models (2024-2025)
    if (name.includes('deepseek r1') || id.includes('deepseek-r1')) return 2024.92;
    if (name.includes('deepseek v3') || id.includes('deepseek-v3')) return 2024.75;
    if (name.includes('deepseek v2') || id.includes('deepseek-v2')) return 2024.4;
    if (name.includes('deepseek') || id.includes('deepseek')) return 2024.1;
    
    // Other providers - assign based on general patterns
    if (name.includes('2025') || id.includes('2025')) return 2025.1;
    if (name.includes('2024') || id.includes('2024')) return 2024.5;
    if (name.includes('2023') || id.includes('2023')) return 2023.5;
    
    // Extract version numbers if present
    const versionMatch = name.match(/(\d+)\.(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]);
      return 2020 + major + (minor * 0.1);
    }
    
    // Default score for unknown models
    return 2020;
  };

  // Filter and categorize models
  const { recommendedModels, searchResults, modelsByProvider } = useMemo(() => {
    const recommended: AIModel[] = [];
    
    // Match models against recommended names in order
    for (const modelName of RECOMMENDED_MODELS) {
      const matchedModel = availableModels.find(model => 
        model.name === modelName
      );
      
      if (matchedModel && !recommended.find(m => m.id === matchedModel.id)) {
        recommended.push(matchedModel);
      }
    }
    
    // Keep all found recommended models (no limit)
    const finalRecommended = recommended;

    // Handle search
    let searchFiltered: AIModel[] = [];
    if (search) {
      const searchLower = search.toLowerCase();
      searchFiltered = availableModels.filter(model =>
        model.name.toLowerCase().includes(searchLower) ||
        model.description.toLowerCase().includes(searchLower) ||
        model.provider.toLowerCase().includes(searchLower) ||
        model.capabilities.some(cap => cap.toLowerCase().includes(searchLower))
      );
    }

    // Group all models by provider (including recommended ones)
    const grouped = availableModels.reduce((acc, model) => {
      const provider = model.originalProvider || model.provider;
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push(model);
      return acc;
    }, {} as Record<string, AIModel[]>);

    // Sort models within each provider by release date (newest first), then alphabetically
    Object.keys(grouped).forEach(provider => {
      grouped[provider].sort((a, b) => {
        const releaseA = getModelReleaseScore(a);
        const releaseB = getModelReleaseScore(b);
        
        // Sort by release score (higher = newer), then alphabetically
        if (releaseA !== releaseB) {
          return releaseB - releaseA; // Descending order (newest first)
        }
        return a.name.localeCompare(b.name); // Alphabetical fallback
      });
    });

    return {
      recommendedModels: finalRecommended,
      searchResults: searchFiltered,
      modelsByProvider: grouped
    };
  }, [availableModels, search]);

  const toggleProvider = (provider: string) => {
    const newExpanded = new Set(expandedProviders);
    if (newExpanded.has(provider)) {
      newExpanded.delete(provider);
    } else {
      newExpanded.add(provider);
    }
    setExpandedProviders(newExpanded);
  };

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
      case 'image-generation':
        return Image;
      default:
        return null; // Don't show icons for other capabilities
    }
  };



  // Helper function to check if a model is a GPT image model
  const isGPTImageModel = (model: AIModel): boolean => {
    return model.id.toLowerCase().includes('gpt-image') || 
           model.name.toLowerCase().includes('gpt image') ||
           model.name.toLowerCase().includes('gpt-image');
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
    <TooltipProvider>
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
              <span className="truncate max-w-[160px]" title={selectedModel.name}>{selectedModel.name}</span>
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
      
      <PopoverContent className="w-[480px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="border-b">
            <CommandInput
              placeholder="Search models..."
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0"
            />
          </div>
          
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No models found.</CommandEmpty>
            
            {/* Search Results */}
            {search && (
              <CommandGroup heading="Search Results">
                {searchResults.map((model: AIModel) => (
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
                    showApiKeyWarning={isGPTImageModel(model) && !openAIApiKeyStatus?.hasKey}
                  />
                ))}
              </CommandGroup>
            )}
            
            {/* Recommended Models (always shown when not searching) */}
            {!search && (
              <CommandGroup heading="Recommended">
                {recommendedModels.map((model: AIModel) => (
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
                    showApiKeyWarning={isGPTImageModel(model) && !openAIApiKeyStatus?.hasKey}
                  />
                ))}
              </CommandGroup>
            )}
            
            {/* Show/Hide All Models Button */}
            {!search && (
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllModels(!showAllModels)}
                  className="w-full justify-start text-muted-foreground h-8"
                >
                  {showAllModels ? (
                    <>
                      <ChevronUp className="mr-2 h-4 w-4" />
                      Hide all models
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      Show all models
                    </>
                  )}
                </Button>
              </div>
            )}
            
            {/* All Models by Provider (accordion style) */}
            {!search && showAllModels && (
              <CommandGroup heading="All Models">
                {Object.keys(modelsByProvider)
                  .sort((a, b) => {
                    // Sort by model count (descending), then alphabetically
                    const countA = modelsByProvider[a].length;
                    const countB = modelsByProvider[b].length;
                    if (countA !== countB) {
                      return countB - countA; // Descending order by count
                    }
                    return a.localeCompare(b); // Alphabetical order as tiebreaker
                  })
                  .map((provider) => (
                  <div key={provider}>
                    <CommandItem
                      onSelect={() => toggleProvider(provider)}
                      className="p-2 font-medium cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{getProviderIcon(provider)}</span>
                          <span className="capitalize">{provider}</span>
                          <Badge variant="secondary" className="text-xs">
                            {modelsByProvider[provider].length}
                          </Badge>
                        </div>
                        {expandedProviders.has(provider) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </CommandItem>
                    
                    {expandedProviders.has(provider) && (
                      <div className="ml-4">
                        {modelsByProvider[provider].map((model: AIModel) => (
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
                            showApiKeyWarning={isGPTImageModel(model) && !openAIApiKeyStatus?.hasKey}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    </TooltipProvider>
  );
}

interface ModelItemProps {
  model: AIModel;
  isSelected: boolean;
  onSelect: () => void;
  getProviderIcon: (provider: string, originalProvider?: string) => string;
  getCapabilityIcon: (capability: string) => React.ComponentType<any> | null;
  showApiKeyWarning?: boolean;
}

function ModelItem({ model, isSelected, onSelect, getProviderIcon, getCapabilityIcon, showApiKeyWarning }: ModelItemProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  
  // Show primary capabilities as icons
  const primaryCapabilities = model.capabilities.slice(0, 4);
  
  const handleSelect = () => {
    // Don't allow selection if API key is required but missing
    if (showApiKeyWarning) {
      return;
    }
    onSelect();
  };
  
  return (
    <CommandItem
      value={`${model.id} ${model.name} ${model.description} ${model.capabilities.join(' ')}`}
      onSelect={handleSelect}
      disabled={!model.isAvailable}
      className={cn(
        "p-3 max-w-[100vw]",
        showApiKeyWarning && "opacity-60"
      )}
    >
      <div className="flex items-center gap-3 w-full">
        {/* Provider icon */}
        <div className="flex-shrink-0">
          <span className="text-lg">{getProviderIcon(model.provider, model.originalProvider)}</span>
        </div>
        
        {/* Model info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-sm truncate flex-1 min-w-0" title={model.name}>{model.name}</span>
            {showApiKeyWarning && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                (requires{' '}
                <button
                  className="text-muted-foreground underline hover:text-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.location.href = '/settings';
                  }}
                >
                  OpenAI API key
                </button>
                )
              </span>
            )}
            {model.description && (
              <Popover open={activeTooltip === 'description'} onOpenChange={(open) => setActiveTooltip(open ? 'description' : null)}>
                <PopoverTrigger asChild>
                  <div
                    className="flex items-center justify-center w-4 h-4 rounded-full bg-muted/50 hover:bg-muted cursor-pointer flex-shrink-0"
                    title={model.description}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTooltip(activeTooltip === 'description' ? null : 'description');
                    }}
                  >
                    <Info className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm z-[100]" side="top" align="center">
                  <p>{model.description}</p>
                </PopoverContent>
              </Popover>
            )}
            {!model.isAvailable && (
              <Badge variant="secondary" className="text-xs h-4 flex-shrink-0">Unavailable</Badge>
            )}
          </div>
        </div>
        
        {/* Capability icons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {primaryCapabilities.map((capability) => {
            const IconComponent = getCapabilityIcon(capability);
            if (!IconComponent) return null; // Skip capabilities without icons
            
            return (
              <Popover key={capability} open={activeTooltip === capability} onOpenChange={(open) => setActiveTooltip(open ? capability : null)}>
                <PopoverTrigger asChild>
                  <div
                    className="flex items-center justify-center w-5 h-5 rounded bg-muted/50 hover:bg-muted cursor-pointer"
                    title={capability}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTooltip(activeTooltip === capability ? null : capability);
                    }}
                  >
                    <IconComponent className="h-3 w-3 text-muted-foreground" />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-40 text-sm z-[100]" side="top" align="center">
                  <p className="capitalize">{capability}</p>
                </PopoverContent>
              </Popover>
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