import { BaseAIProvider } from './BaseProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { OpenAIProvider, ImageGenerationOptions, ImageResult } from './OpenAIProvider';
import { ModelMappings } from './ModelMappings';
import { AIModel, ChatMessage, ProviderError } from '../../types/ai';

export class AIProviderManager {
  private openRouterProvider: OpenRouterProvider | null = null;
  private openAIProvider: OpenAIProvider | null = null;
  private initialized = false;

  constructor() {
    // Don't initialize providers in constructor - wait until first use
  }

  private initializeProviders() {
    if (this.initialized) return;

    // Initialize providers
    this.openRouterProvider = new OpenRouterProvider();
    this.openAIProvider = new OpenAIProvider();
    this.initialized = true;
  }

  getProvider(modelId: string): BaseAIProvider {
    this.initializeProviders();
    
    // Check if it's an image generation model (OpenAI)
    if (this.openAIProvider?.isImageModel(modelId)) {
      if (!this.openAIProvider) {
        throw new Error('OpenAI provider not initialized');
      }
      return this.openAIProvider;
    }
    
    // Default to OpenRouter for text models
    if (!this.openRouterProvider) {
      throw new Error('OpenRouter provider not initialized');
    }

    if (!this.openRouterProvider.hasApiKey()) {
      throw new Error('OpenRouter API key not configured. Please add OPENROUTER_API_KEY to your environment variables.');
    }

    return this.openRouterProvider;
  }

  getProviderForModel(modelId: string): BaseAIProvider {
    return this.getProvider(modelId);
  }

  async getAllModels(): Promise<AIModel[]> {
    this.initializeProviders();
    
    const allModels: AIModel[] = [];

    // Get OpenRouter models
    if (this.openRouterProvider?.hasApiKey()) {
      try {
        const openRouterModels = await this.openRouterProvider.getModels();
        allModels.push(...openRouterModels.map(model => ({
          ...model,
          isAvailable: true,
        })));
      } catch (error) {
        console.error('Failed to fetch OpenRouter models:', error);
      }
    } else {
      console.warn('OpenRouter API key not available, OpenRouter models will not be available');
    }

    // Get OpenAI models (image generation models are always available)
    if (this.openAIProvider) {
      try {
        const openAIModels = await this.openAIProvider.getModels();
        allModels.push(...openAIModels);
      } catch (error) {
        console.error('Failed to fetch OpenAI models:', error);
      }
    }

    return allModels;
  }

  async sendMessage(modelId: string, messages: ChatMessage[], userId?: string): Promise<string> {
    this.initializeProviders();
    
    // Route to appropriate provider based on model type
    const provider = this.getProvider(modelId);
    
    if (provider === this.openAIProvider) {
      // OpenAI models (image generation)
      return await provider.sendMessage(modelId, messages, userId);
    } else {
      // OpenRouter models (text generation)
      if (!this.openRouterProvider) {
        throw new Error('OpenRouter provider not initialized');
      }

      // Check if user has their own API key, otherwise require system key
      if (!userId && !this.openRouterProvider.hasApiKey()) {
        throw new Error('OpenRouter API key not configured. Please add OPENROUTER_API_KEY to your environment variables.');
      }

      const openRouterModelId = ModelMappings.getOpenRouterModelId(modelId);
      return await this.openRouterProvider.sendMessage(openRouterModelId, messages, userId);
    }
  }

  async *streamMessage(modelId: string, messages: ChatMessage[], userId?: string, fileService?: any, env?: any): AsyncIterableIterator<string> {
    this.initializeProviders();
    
    // Route to appropriate provider based on model type
    const provider = this.getProvider(modelId);
    
    if (provider === this.openAIProvider) {
      // OpenAI models (image generation with streaming)
      yield* provider.streamMessage(modelId, messages, userId, fileService, env);
    } else {
      // OpenRouter models (text generation)
      if (!this.openRouterProvider) {
        throw new Error('OpenRouter provider not initialized');
      }

      // Check if user has their own API key, otherwise require system key
      if (!userId && !this.openRouterProvider.hasApiKey()) {
        throw new Error('OpenRouter API key not configured. Please add OPENROUTER_API_KEY to your environment variables.');
      }

      const openRouterModelId = ModelMappings.getOpenRouterModelId(modelId);
      yield* this.openRouterProvider.streamMessage(openRouterModelId, messages, userId);
    }
  }

  async generateImage(modelId: string, prompt: string, options: ImageGenerationOptions = {}, userId?: string): Promise<ImageResult> {
    this.initializeProviders();
    
    if (!this.openAIProvider) {
      throw new Error('OpenAI provider not initialized');
    }

    if (!this.openAIProvider.isImageModel(modelId)) {
      throw new Error(`Model ${modelId} is not an image generation model`);
    }

    return await this.openAIProvider.generateImage(prompt, options, userId, modelId);
  }

  isImageGenerationModel(modelId: string): boolean {
    this.initializeProviders();
    return this.openAIProvider?.isImageModel(modelId) || false;
  }

  async validateProvider(providerName: string, apiKey: string): Promise<boolean> {
    if (providerName === 'openrouter') {
      this.initializeProviders();
      if (!this.openRouterProvider) {
        return false;
      }
      return this.openRouterProvider.validateApiKey(apiKey);
    }
    
    if (providerName === 'openai') {
      this.initializeProviders();
      if (!this.openAIProvider) {
        return false;
      }
      return this.openAIProvider.validateApiKey(apiKey);
    }
    
    return false;
  }

  getAvailableProviders(): string[] {
    return ['openrouter', 'openai'];
  }

  getConfiguredProviders(): string[] {
    this.initializeProviders();
    const configured: string[] = [];
    
    if (this.openRouterProvider?.hasApiKey()) {
      configured.push('openrouter');
    }
    
    if (this.openAIProvider?.hasApiKey()) {
      configured.push('openai');
    }
    
    return configured;
  }

  getProviderStatus(): Record<string, any> {
    this.initializeProviders();
    
    const status: Record<string, any> = {};
    
    if (this.openRouterProvider) {
      status.openrouter = this.openRouterProvider.getProviderStatus();
    }

    if (this.openAIProvider) {
      status.openai = this.openAIProvider.getProviderStatus();
    }

    return status;
  }
} 