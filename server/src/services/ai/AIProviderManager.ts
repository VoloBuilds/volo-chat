import { BaseAIProvider } from './BaseProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { GoogleProvider } from './GoogleProvider';
import { AIModel, ChatMessage } from '../../types/ai';

export class AIProviderManager {
  private providers: Map<string, BaseAIProvider> = new Map();
  private modelToProvider: Map<string, string> = new Map();
  private allProviders: BaseAIProvider[] = [];
  private initialized = false;

  constructor() {
    // Don't initialize providers in constructor - wait until first use
  }

  private initializeProviders() {
    if (this.initialized) return;

    // Create all providers regardless of API key availability
    this.allProviders = [
      new OpenAIProvider(),
      new AnthropicProvider(),
      new GoogleProvider(),
    ];

    // Always register all providers and their models
    this.allProviders.forEach(provider => {
      this.providers.set(provider.name, provider);
      
      // Map models to their providers
      provider.models.forEach(model => {
        this.modelToProvider.set(model.id, provider.name);
      });
    });

    this.initialized = true;
  }

  getProvider(modelId: string): BaseAIProvider {
    this.initializeProviders();
    
    const providerName = this.modelToProvider.get(modelId);
    if (!providerName) {
      throw new Error(`No provider found for model: ${modelId}`);
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not available`);
    }

    // Check API key availability only when actually using the provider
    if (!provider.hasApiKey()) {
      throw new Error(`API key not configured for ${provider.name}. Please add ${provider.name.toUpperCase()}_API_KEY to your environment variables.`);
    }

    return provider;
  }

  getAllModels(): AIModel[] {
    this.initializeProviders();
    
    const models: AIModel[] = [];
    
    // Return all models from all providers
    this.allProviders.forEach(provider => {
      models.push(...provider.models.map(model => ({
        ...model,
        // Mark as available if API key is present, unavailable if not
        isAvailable: provider.hasApiKey(),
      })));
    });

    return models;
  }

  async sendMessage(modelId: string, messages: ChatMessage[]): Promise<string> {
    const provider = this.getProvider(modelId);
    return provider.sendMessage(modelId, messages);
  }

  async *streamMessage(modelId: string, messages: ChatMessage[]): AsyncIterableIterator<string> {
    const provider = this.getProvider(modelId);
    yield* provider.streamMessage(modelId, messages);
  }

  async validateProvider(providerName: string, apiKey: string): Promise<boolean> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return false;
    }
    return provider.validateApiKey(apiKey);
  }

  getAvailableProviders(): string[] {
    this.initializeProviders();
    // Return all provider names
    return Array.from(this.providers.keys());
  }

  getConfiguredProviders(): string[] {
    this.initializeProviders();
    // Return only providers with API keys
    return this.allProviders
      .filter(provider => provider.hasApiKey())
      .map(provider => provider.name);
  }
} 