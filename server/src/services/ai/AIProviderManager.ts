import { BaseAIProvider } from './BaseProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { ModelMappings } from './ModelMappings';
import { AIModel, ChatMessage, ProviderError } from '../../types/ai';

export class AIProviderManager {
  private openRouterProvider: OpenRouterProvider | null = null;
  private initialized = false;

  constructor() {
    // Don't initialize providers in constructor - wait until first use
  }

  private initializeProviders() {
    if (this.initialized) return;

    // Initialize only OpenRouter provider
    this.openRouterProvider = new OpenRouterProvider();
    this.initialized = true;
  }

  getProvider(modelId: string): BaseAIProvider {
    this.initializeProviders();
    
    if (!this.openRouterProvider) {
      throw new Error('OpenRouter provider not initialized');
    }

    if (!this.openRouterProvider.hasApiKey()) {
      throw new Error('OpenRouter API key not configured. Please add OPENROUTER_API_KEY to your environment variables.');
    }

    return this.openRouterProvider;
  }

  async getAllModels(): Promise<AIModel[]> {
    this.initializeProviders();
    
    if (!this.openRouterProvider?.hasApiKey()) {
      console.warn('OpenRouter API key not available, no models will be available');
      return [];
    }

    try {
      const openRouterModels = await this.openRouterProvider.getModels();
      return openRouterModels.map(model => ({
        ...model,
        isAvailable: true,
      }));
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      return [];
    }
  }

  async sendMessage(modelId: string, messages: ChatMessage[]): Promise<string> {
    this.initializeProviders();
    
    if (!this.openRouterProvider?.hasApiKey()) {
      throw new Error('OpenRouter API key not configured. Please add OPENROUTER_API_KEY to your environment variables.');
    }

    const openRouterModelId = ModelMappings.getOpenRouterModelId(modelId);
    return await this.openRouterProvider.sendMessage(openRouterModelId, messages);
  }

  async *streamMessage(modelId: string, messages: ChatMessage[]): AsyncIterableIterator<string> {
    this.initializeProviders();
    
    if (!this.openRouterProvider?.hasApiKey()) {
      throw new Error('OpenRouter API key not configured. Please add OPENROUTER_API_KEY to your environment variables.');
    }

    const openRouterModelId = ModelMappings.getOpenRouterModelId(modelId);
    yield* this.openRouterProvider.streamMessage(openRouterModelId, messages);
  }

  async validateProvider(providerName: string, apiKey: string): Promise<boolean> {
    if (providerName !== 'openrouter') {
      return false;
    }
    
    this.initializeProviders();
    if (!this.openRouterProvider) {
      return false;
    }
    
    return this.openRouterProvider.validateApiKey(apiKey);
  }

  getAvailableProviders(): string[] {
    return ['openrouter'];
  }

  getConfiguredProviders(): string[] {
    this.initializeProviders();
    if (this.openRouterProvider?.hasApiKey()) {
      return ['openrouter'];
    }
    return [];
  }

  getProviderStatus(): Record<string, any> {
    this.initializeProviders();
    
    const status: Record<string, any> = {};
    
    if (this.openRouterProvider) {
      status.openrouter = this.openRouterProvider.getProviderStatus();
    }

    return status;
  }
} 