import OpenAI from 'openai';
import { BaseAIProvider } from './BaseProvider';
import { AIModel, ChatMessage } from '../../types/ai';

export class OpenAIProvider extends BaseAIProvider {
  name = 'openai';
  private client: OpenAI | null = null;

  models: AIModel[] = [
    {
      id: 'o1',
      name: 'GPT-o1',
      provider: 'openai',
      description: 'New reasoning model designed for complex problem solving',
      contextWindow: 200000,
      pricing: { input: 0.015, output: 0.06 },
      capabilities: ['text', 'reasoning', 'code', 'math'],
      isAvailable: true,
    },
    {
      id: 'o1-mini',
      name: 'GPT-o1 Mini',
      provider: 'openai',
      description: 'Faster and cheaper reasoning model for coding, math, and science',
      contextWindow: 128000,
      pricing: { input: 0.003, output: 0.012 },
      capabilities: ['text', 'reasoning', 'code', 'math'],
      isAvailable: true,
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      description: 'Flagship multimodal model with vision, faster and cheaper than GPT-4 Turbo',
      contextWindow: 128000,
      pricing: { input: 0.0025, output: 0.01 },
      capabilities: ['text', 'vision', 'code', 'analysis'],
      isAvailable: true,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      description: 'Affordable and intelligent small model for fast, lightweight tasks',
      contextWindow: 128000,
      pricing: { input: 0.00015, output: 0.0006 },
      capabilities: ['text', 'vision', 'code'],
      isAvailable: true,
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'openai',
      description: 'Previous generation large context model with vision capabilities',
      contextWindow: 128000,
      pricing: { input: 0.01, output: 0.03 },
      capabilities: ['text', 'vision', 'code'],
      isAvailable: true,
    },
    {
      id: 'gpt-4',
      name: 'GPT-4',
      provider: 'openai',
      description: 'High-intelligence flagship model for complex, multi-step tasks',
      contextWindow: 8192,
      pricing: { input: 0.03, output: 0.06 },
      capabilities: ['text', 'code'],
      isAvailable: true,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      description: 'Fast, inexpensive model for simple tasks',
      contextWindow: 16385,
      pricing: { input: 0.0005, output: 0.0015 },
      capabilities: ['text', 'code'],
      isAvailable: true,
    },
  ];

  constructor() {
    super();
    // Initialize client lazily when needed
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.getRequiredApiKey();
      this.client = new OpenAI({
        apiKey,
      });
    }
    return this.client;
  }

  async sendMessage(model: string, messages: ChatMessage[]): Promise<string> {
    try {
      const client = this.getClient();
      const openAIMessages = messages.map(msg => this.formatMessageContent(msg));

      const response = await client.chat.completions.create({
        model,
        messages: openAIMessages,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *streamMessage(model: string, messages: ChatMessage[]): AsyncIterableIterator<string> {
    try {
      const client = this.getClient();
      const openAIMessages = messages.map(msg => this.formatMessageContent(msg));

      const stream = await client.chat.completions.create({
        model,
        messages: openAIMessages,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('OpenAI streaming error:', error);
      throw new Error(`OpenAI streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Add image attachments
    for (const attachment of message.attachments) {
      console.log(`[OPENAI] Processing attachment:`, {
        type: attachment.type,
        mimeType: attachment.mimeType,
        dataType: typeof attachment.data,
        dataLength: attachment.data ? attachment.data.length : 0,
        dataPrefix: attachment.data ? attachment.data.substring(0, 50) : 'no data'
      });

      if (attachment.type === 'image' && attachment.data) {
        // OpenAI expects base64 data in data URL format: data:image/jpeg;base64,<base64>
        let imageUrl: string;
        
        if (attachment.data.startsWith('data:')) {
          // Already in data URL format
          imageUrl = attachment.data;
        } else if (attachment.data.startsWith('http://') || attachment.data.startsWith('https://')) {
          // Direct URL - OpenAI supports this but our current setup uses base64
          imageUrl = attachment.data;
        } else {
          // Raw base64 - convert to data URL format
          const mimeType = attachment.mimeType || 'image/jpeg';
          imageUrl = `data:${mimeType};base64,${attachment.data}`;
        }

        console.log(`[OPENAI] Using image:`, {
          mimeType: attachment.mimeType,
          urlFormat: imageUrl.substring(0, 50) + '...',
          urlLength: imageUrl.length
        });

        contentParts.push({
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        });
      }
    }

    return {
      role: message.role as 'user' | 'assistant' | 'system',
      content: contentParts,
    };
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }
} 