export interface ModelMapping {
  pattern: string | RegExp;
  openRouterModelId: string;
  useOpenRouter: boolean;
}

export class ModelMappings {
  private static mappings: ModelMapping[] = [
    // OpenAI models - route to OpenRouter
    { pattern: /^(gpt-.*)$/, openRouterModelId: 'openai/$1', useOpenRouter: true },
    { pattern: 'o1', openRouterModelId: 'openai/o1', useOpenRouter: true },
    { pattern: 'o1-mini', openRouterModelId: 'openai/o1-mini', useOpenRouter: true },
    
    // Anthropic models - route to OpenRouter
    { pattern: /^(claude-.*)$/, openRouterModelId: 'anthropic/$1', useOpenRouter: true },
    
    // Google models - route to OpenRouter
    { pattern: /^(gemini-.*)$/, openRouterModelId: 'google/$1', useOpenRouter: true },
    
    // OpenRouter-specific models
    { pattern: /^openrouter\/(.*)$/, openRouterModelId: '$1', useOpenRouter: true },
    
    // Fallback: try to map unknown models to OpenRouter
    { pattern: /^(.+)$/, openRouterModelId: '$1', useOpenRouter: true },
  ];

  static getMapping(modelId: string): ModelMapping | null {
    for (const mapping of this.mappings) {
      if (typeof mapping.pattern === 'string') {
        if (mapping.pattern === modelId) {
          return {
            ...mapping,
            openRouterModelId: mapping.openRouterModelId.replace('$1', modelId),
          };
        }
      } else if (mapping.pattern instanceof RegExp) {
        const match = modelId.match(mapping.pattern);
        if (match) {
          return {
            ...mapping,
            openRouterModelId: mapping.openRouterModelId.replace('$1', match[1] || match[0]),
          };
        }
      }
    }
    return null;
  }

  static shouldUseOpenRouter(modelId: string): boolean {
    const mapping = this.getMapping(modelId);
    return mapping?.useOpenRouter ?? true; // Default to true since we only use OpenRouter now
  }

  static getOpenRouterModelId(modelId: string): string {
    const mapping = this.getMapping(modelId);
    if (!mapping) return modelId;
    
    return mapping.openRouterModelId;
  }
} 