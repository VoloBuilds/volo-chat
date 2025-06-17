import OpenAI from 'openai';
import { BaseAIProvider } from './BaseProvider';
import { AIModel, ChatMessage, ProviderError } from '../../types/ai';

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
  private modelCache: Map<string, AIModel[]> = new Map();
  private lastModelFetch = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  constructor() {
    super();
    // Initialize models asynchronously
    this.initializeModels().catch(error => {
      console.warn('Failed to initialize OpenRouter models:', error);
    });
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

  async sendMessage(model: string, messages: ChatMessage[]): Promise<string> {
    try {
      const client = this.getClient();
      const openAIMessages = messages.map(msg => this.formatMessageContent(msg));

      // Check if any messages contain file attachments to add plugin configuration
      const hasFileAttachments = messages.some(msg => 
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
      
      const providerError: ProviderError = {
        name: 'ProviderError',
        message: `OpenRouter API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider: 'openrouter',
        retryable: this.isRetryableError(error),
      };
      
      throw providerError;
    }
  }

  async *streamMessage(model: string, messages: ChatMessage[]): AsyncIterableIterator<string> {
    try {
      const client = this.getClient();
      const openAIMessages = messages.map(msg => this.formatMessageContent(msg));

      // Check if any messages contain file attachments to add plugin configuration
      const hasFileAttachments = messages.some(msg => 
        msg.attachments?.some(att => 
          att.type === 'pdf' || att.type === 'text' || att.mimeType === 'application/pdf'
        )
      );

      const requestParams: any = {
        model,
        messages: openAIMessages,
        temperature: 0.7,
        stream: true,
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

      const stream = await client.chat.completions.create(requestParams) as any;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('OpenRouter streaming error:', error);
      
      const providerError: ProviderError = {
        name: 'ProviderError',
        message: `OpenRouter streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider: 'openrouter',
        retryable: this.isRetryableError(error),
      };
      
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
      } else if (attachment.type === 'text') {
        // Handle text attachments by including them inline as text content
        // OpenRouter doesn't support text/plain file uploads
        if (attachment.data) {
          let textContent: string;
          
          if (attachment.data.startsWith('data:text/plain;base64,')) {
            // Decode base64 text
            try {
              textContent = atob(attachment.data.split(',')[1]);
            } catch (error) {
              console.warn(`[OPENROUTER] Failed to decode base64 text attachment:`, error);
              textContent = attachment.data;
            }
          } else if (attachment.data.startsWith('http://') || attachment.data.startsWith('https://')) {
            // For URLs, we can't directly include the content, so reference it
            console.warn(`[OPENROUTER] Text attachment from URL not directly supported: ${attachment.data}`);
            textContent = `[Referenced file: ${attachment.data}]`;
          } else {
            // Assume it's already plain text
            textContent = attachment.data;
          }

          console.log(`[OPENROUTER] Adding text attachment as inline content:`, {
            type: attachment.type,
            mimeType: attachment.mimeType,
            textLength: textContent.length
          });

          contentParts.push({
            type: 'text',
            text: `\n\n--- Attached Text Content ---\n${textContent}\n--- End Attached Content ---\n`,
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