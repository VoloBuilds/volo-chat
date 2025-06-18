import OpenAI from 'openai';
import { BaseAIProvider } from './BaseProvider';
import { AIModel, ChatMessage, ProviderError } from '../../types/ai';
import { UserApiKeyService } from '../UserApiKeyService';
import { getDatabase } from '../../lib/db-cloudflare';
import { users } from '../../schema';
import { eq } from 'drizzle-orm';

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  architecture: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export class OpenRouterProvider extends BaseAIProvider {
  name = 'openrouter';
  models: AIModel[] = [];
  private client: OpenAI | null = null;
  private userClients: Map<string, OpenAI> = new Map(); // User-specific clients
  private modelCache: Map<string, AIModel[]> = new Map();
  private lastModelFetch = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  constructor() {
    super();
    // Models will be initialized lazily when first needed
  }

  private async initializeModels(): Promise<void> {
    try {
      await this.fetchModels();
    } catch (error) {
      console.error('OpenRouter model initialization failed:', error);
      // Continue with empty model list - will retry on next request
    }
  }

  private async fetchModels(): Promise<AIModel[]> {
    const now = Date.now();
    const cacheKey = 'models';
    
    // Check cache first
    if (this.modelCache.has(cacheKey) && (now - this.lastModelFetch) < this.CACHE_TTL) {
      return this.modelCache.get(cacheKey)!;
    }

    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.log('OpenRouter API key not available, skipping model fetch');
        return [];
      }

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }

      const data: OpenRouterModelsResponse = await response.json();
      const transformedModels = this.transformModels(data.data);
      
      // Update cache
      this.modelCache.set(cacheKey, transformedModels);
      this.lastModelFetch = now;
      this.models = transformedModels;
      
      console.log(`Fetched ${transformedModels.length} models from OpenRouter`);
      return transformedModels;
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      throw error;
    }
  }

  private transformModels(openRouterModels: OpenRouterModel[]): AIModel[] {
    return openRouterModels.map(model => ({
      id: model.id,
      name: model.name,
      provider: 'openrouter' as const,
      description: model.description || '',
      contextWindow: model.context_length || 4096,
      pricing: {
        input: parseFloat(model.pricing?.prompt || '0'),
        output: parseFloat(model.pricing?.completion || '0'),
      },
      capabilities: this.extractCapabilities(model),
      isAvailable: true,
      originalProvider: this.extractOriginalProvider(model.id),
    }));
  }

  private extractCapabilities(model: OpenRouterModel): string[] {
    const capabilities = ['text']; // All models support text
    
    if (model.architecture?.input_modalities) {
      if (model.architecture.input_modalities.includes('image')) {
        capabilities.push('vision');
      }
      if (model.architecture.input_modalities.includes('audio')) {
        capabilities.push('audio');
      }
    }
    
    // Infer capabilities from model name/description
    const description = (model.description || '').toLowerCase();
    const name = model.name.toLowerCase();
    
    if (description.includes('code') || name.includes('code')) {
      capabilities.push('code');
    }
    if (description.includes('reasoning') || name.includes('reasoning')) {
      capabilities.push('reasoning');
    }
    if (description.includes('math') || name.includes('math')) {
      capabilities.push('math');
    }
    if (description.includes('analysis') || name.includes('analysis')) {
      capabilities.push('analysis');
    }
    
    return [...new Set(capabilities)]; // Remove duplicates
  }

  private extractOriginalProvider(modelId: string): string | undefined {
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[0] : undefined;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.getRequiredApiKey();
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
          'X-Title': 'Volo Chat',
        },
      });
    }
    return this.client;
  }

  /**
   * Get user-specific API key, fallback to system key
   */
  async getUserApiKey(userId?: string): Promise<string | null> {
    if (!userId) {
      return this.getApiKey();
    }

    try {
      // Try to get user's API key first
      const userKey = await UserApiKeyService.getUserApiKey(userId);
      if (userKey) {
        console.log(`Using user API key for user: ${userId}`);
        return userKey;
      }
    } catch (error) {
      console.warn(`Failed to get user API key for ${userId}, falling back to system key:`, error);
    }

    // Fallback to system key
    const systemKey = this.getApiKey();
    if (systemKey) {
      console.log(`Using system API key for user: ${userId}`);
    }
    return systemKey;
  }

  /**
   * Get user's custom instructions from database
   */
  async getUserCustomInstructions(userId?: string): Promise<string | null> {
    if (!userId) {
      return null;
    }

    try {
      const db = await getDatabase();
      const [user] = await db
        .select({ customInstructions: users.customInstructions })
        .from(users)
        .where(eq(users.id, userId));

      return user?.customInstructions || null;
    } catch (error) {
      console.warn(`Failed to get custom instructions for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Prepare messages with custom instructions prepended
   */
  private async prepareMessagesWithInstructions(messages: ChatMessage[], userId?: string): Promise<ChatMessage[]> {
    const customInstructions = await this.getUserCustomInstructions(userId);
    
    if (!customInstructions?.trim()) {
      return messages;
    }

    // Create a system message with custom instructions
    const systemMessage: ChatMessage = {
      role: 'system',
      content: customInstructions.trim(),
    };

    // If the first message is already a system message, prepend the custom instructions to it
    if (messages.length > 0 && messages[0].role === 'system') {
      const existingSystemMessage = messages[0];
      const combinedContent = `${customInstructions.trim()}\n\n${existingSystemMessage.content}`;
      
      return [
        { ...existingSystemMessage, content: combinedContent },
        ...messages.slice(1)
      ];
    }

    // Otherwise, add the system message at the beginning
    return [systemMessage, ...messages];
  }

  /**
   * Get client for specific user, with fallback to system client
   */
  private async getClientForUser(userId?: string): Promise<OpenAI> {
    if (!userId) {
      return this.getClient();
    }

    try {
      // Check if we have a cached client for this user
      if (this.userClients.has(userId)) {
        return this.userClients.get(userId)!;
      }

      // Try to get user's API key
      const userApiKey = await this.getUserApiKey(userId);
      if (!userApiKey) {
        // No user key available, use system client
        return this.getClient();
      }

      // Create user-specific client
      const userClient = new OpenAI({
        apiKey: userApiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
          'X-Title': 'Volo Chat',
        },
      });

      // Cache the client
      this.userClients.set(userId, userClient);
      return userClient;
    } catch (error) {
      console.warn(`Failed to create user client for ${userId}, using system client:`, error);
      return this.getClient();
    }
  }

  async sendMessage(model: string, messages: ChatMessage[], userId?: string): Promise<string> {
    try {
      const client = await this.getClientForUser(userId);
      const messagesWithInstructions = await this.prepareMessagesWithInstructions(messages, userId);
      const openAIMessages = messagesWithInstructions.map(msg => this.formatMessageContent(msg));

      // Check if any messages contain file attachments to add plugin configuration
      const hasFileAttachments = messagesWithInstructions.some(msg => 
        msg.attachments?.some(att => 
          att.type === 'pdf' || att.type === 'text' || att.mimeType === 'application/pdf'
        )
      );

      const requestParams: any = {
        model,
        messages: openAIMessages,
        temperature: 0.7,
      };

      // Add plugin configuration for PDF processing if needed
      if (hasFileAttachments) {
        requestParams.plugins = [
          {
            id: 'file-parser',
            pdf: {
              engine: 'pdf-text', // Use free text extraction by default
            },
          },
        ];
      }

      const response = await client.chat.completions.create(requestParams);

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenRouter API error:', error);
      
      // Extract more meaningful error message
      let errorMessage = 'Unknown error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // Try to extract from the error object
        const err = error as any;
        if (err.error?.message) {
          errorMessage = err.error.message;
        } else if (err.message) {
          errorMessage = err.message;
        }
      }
      
      // Create a proper Error object that extends Error
      const providerError = new Error(errorMessage);
      (providerError as any).name = 'ProviderError';
      (providerError as any).provider = 'openrouter';
      (providerError as any).retryable = this.isRetryableError(error);
      
      throw providerError;
    }
  }

  async *streamMessage(model: string, messages: ChatMessage[], userId?: string, fileService?: any, env?: any): AsyncIterableIterator<string> {
    try {
      console.log(`[OPENROUTER] Starting streaming for model: ${model}${userId ? ` for user: ${userId}` : ''}`);
      
      const client = await this.getClientForUser(userId);
      const messagesWithInstructions = await this.prepareMessagesWithInstructions(messages, userId);
      const formattedMessages = messagesWithInstructions.map(msg => this.formatMessageContent(msg));

      console.log(`[OPENROUTER] Formatted ${formattedMessages.length} messages for streaming`);

      const stream = await client.chat.completions.create({
        model: model,
        messages: formattedMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4000,
      });

      console.log(`[OPENROUTER] Stream created successfully for model: ${model}`);

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('OpenRouter streaming error:', error);
      console.error('OpenRouter streaming error details:', JSON.stringify(error, null, 2));
      
      // Extract status code and error details
      const statusCode = (error as any)?.status || (error as any)?.statusCode;
      const errorCode = (error as any)?.code;
      
      // Extract more meaningful error message - be more thorough
      let errorMessage = 'Unknown error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // Try to extract from the error object - be more comprehensive
        const err = error as any;
        
        // Check various possible locations for the error message
        if (err.error?.message) {
          errorMessage = err.error.message;
        } else if (err.message) {
          errorMessage = err.message;
        } else if (err.response?.data?.error?.message) {
          errorMessage = err.response.data.error.message;
        } else if (err.response?.data?.message) {
          errorMessage = err.response.data.message;
        } else if (err.body?.error?.message) {
          errorMessage = err.body.error.message;
        } else if (err.body?.message) {
          errorMessage = err.body.message;
        } else if (typeof err.error === 'string') {
          errorMessage = err.error;
        }
      }
      
      console.log('[OPENROUTER] Extracted error message:', errorMessage);
      
      // Create a proper Error object that extends Error
      const providerError = new Error(errorMessage);
      (providerError as any).name = 'ProviderError';
      (providerError as any).provider = 'openrouter';
      (providerError as any).retryable = this.isRetryableError(error);
      (providerError as any).statusCode = statusCode;
      
      throw providerError;
    }
  }

  private formatMessageContent(message: ChatMessage): any {
    // If no attachments, return simple format
    if (!message.attachments || message.attachments.length === 0) {
      return {
        role: message.role as 'user' | 'assistant' | 'system',
        content: message.content,
      };
    }

    // Build content array with text and attachments for multimodal input
    const contentParts: any[] = [];

    // Add text content if present
    if (message.content.trim()) {
      contentParts.push({
        type: 'text',
        text: message.content,
      });
    }

    // Add attachments
    for (const attachment of message.attachments) {
      console.log(`[OPENROUTER] Processing attachment:`, {
        type: attachment.type,
        mimeType: attachment.mimeType,
        dataType: typeof attachment.data,
        dataLength: attachment.data ? attachment.data.length : 0,
        dataPrefix: attachment.data ? attachment.data.substring(0, 50) : 'no data'
      });

      if (attachment.type === 'image' && attachment.data) {
        // Handle image attachments using OpenAI-compatible image_url format
        let imageUrl: string;
        
        if (attachment.data.startsWith('http://') || attachment.data.startsWith('https://')) {
          // Direct URL from R2 or other sources
          imageUrl = attachment.data;
          console.log(`[OPENROUTER] Using direct URL image:`, attachment.data);
        } else if (attachment.data.startsWith('data:')) {
          // Already in data URL format (data:image/jpeg;base64,...)
          imageUrl = attachment.data;
          console.log(`[OPENROUTER] Using data URL image:`, {
            length: attachment.data.length
          });
        } else {
          // Raw base64 - convert to data URL format
          const mimeType = attachment.mimeType || 'image/jpeg';
          
          // Validate media type is supported
          const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          const finalMimeType = supportedTypes.includes(mimeType) ? mimeType : 'image/jpeg';
          
          imageUrl = `data:${finalMimeType};base64,${attachment.data}`;
          console.log(`[OPENROUTER] Converted base64 to data URL:`, {
            originalMimeType: mimeType,
            finalMimeType,
            base64Length: attachment.data.length
          });
        }

        contentParts.push({
          type: 'image_url',
          image_url: {
            url: imageUrl,
            detail: 'auto' // Let OpenRouter decide the detail level
          },
        });
      } else if (attachment.type === 'text' || this.isTextBasedFile(attachment.mimeType)) {
        // Handle text-based attachments by including them inline as text content
        // This includes text files, JSON, CSV, and other readable formats
        if (attachment.data) {
          let textContent: string;
          
          if (attachment.data.startsWith('data:') && attachment.data.includes('base64,')) {
            // Decode base64 content
            try {
              textContent = atob(attachment.data.split(',')[1]);
            } catch (error) {
              console.warn(`[OPENROUTER] Failed to decode base64 attachment:`, error);
              textContent = attachment.data;
            }
          } else if (attachment.data.startsWith('http://') || attachment.data.startsWith('https://')) {
            // For URLs, we can't directly include the content, so reference it
            console.warn(`[OPENROUTER] File attachment from URL not directly supported: ${attachment.data}`);
            textContent = `[Referenced file: ${attachment.data}]`;
          } else {
            // Assume it's already plain text
            textContent = attachment.data;
          }

          const fileType = this.getFileTypeDisplay(attachment.mimeType);
          console.log(`[OPENROUTER] Adding ${fileType} attachment as inline content:`, {
            type: attachment.type,
            mimeType: attachment.mimeType,
            textLength: textContent.length
          });

          contentParts.push({
            type: 'text',
            text: `\n\n--- Attached ${fileType} Content ---\n${textContent}\n--- End Attached Content ---\n`,
          });
        }
      } else if (attachment.type === 'pdf' || attachment.mimeType === 'application/pdf') {
        // Handle PDF attachments using file format - only PDFs are supported
        let fileData: string;
        let filename = 'document.pdf';

        if (attachment.data) {
          if (attachment.data.startsWith('data:')) {
            // Already in data URL format
            fileData = attachment.data;
          } else if (attachment.data.startsWith('http://') || attachment.data.startsWith('https://')) {
            // For URLs, we need to fetch the content and encode it
            console.warn(`[OPENROUTER] PDF attachment from URL - limited support: ${attachment.data}`);
            // This is a limitation - OpenRouter expects base64 data URLs for files
            // For now, we'll note this in the content instead
            contentParts.push({
              type: 'text',
              text: `\n\n--- PDF Document ---\n[PDF file available at: ${attachment.data}]\nNote: PDF content processing from URLs has limitations.\n--- End PDF Reference ---\n`,
            });
            continue;
          } else {
            // Raw base64 - convert to data URL format
            const mimeType = attachment.mimeType || 'application/pdf';
            fileData = `data:${mimeType};base64,${attachment.data}`;
          }

          console.log(`[OPENROUTER] Adding PDF attachment:`, {
            type: attachment.type,
            mimeType: attachment.mimeType,
            filename,
            dataLength: fileData.length
          });

          contentParts.push({
            type: 'file',
            file: {
              filename,
              file_data: fileData,
            },
          });
        }
      }
    }

    return {
      role: message.role as 'user' | 'assistant' | 'system',
      content: contentParts,
    };
  }

  private isTextBasedFile(mimeType?: string): boolean {
    if (!mimeType) return false;
    
    const textBasedTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/csv',
      'text/rtf',
      'application/rtf'
    ];
    
    return textBasedTypes.includes(mimeType) || mimeType.startsWith('text/');
  }

  private getFileTypeDisplay(mimeType?: string): string {
    if (!mimeType) return 'File';
    
    switch (mimeType) {
      case 'application/json':
        return 'JSON';
      case 'text/csv':
        return 'CSV';
      case 'text/markdown':
        return 'Markdown';
      case 'text/rtf':
      case 'application/rtf':
        return 'RTF';
      case 'text/plain':
        return 'Text';
      default:
        if (mimeType.startsWith('text/')) {
          return 'Text';
        }
        return 'File';
    }
  }

  private isRetryableError(error: any): boolean {
    // Rate limiting, temporary server errors are retryable
    if (error?.status) {
      return error.status === 429 || error.status >= 500;
    }
    return false;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      return response.ok;
    } catch (error) {
      console.error('OpenRouter API key validation failed:', error);
      return false;
    }
  }

  async getModels(): Promise<AIModel[]> {
    try {
      return await this.fetchModels();
    } catch (error) {
      console.error('Failed to get OpenRouter models:', error);
      return this.models; // Return cached models if fetch fails
    }
  }

  getProviderStatus(): { available: boolean; modelsCount: number } {
    return {
      available: this.hasApiKey(),
      modelsCount: this.models.length,
    };
  }
} 