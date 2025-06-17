import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from '../BaseProvider';
import { AIModel, ChatMessage } from '../../../types/ai';

export class AnthropicProvider extends BaseAIProvider {
  name = 'anthropic';
  private client: Anthropic | null = null;

  models: AIModel[] = [
    {
      id: 'claude-opus-4-20250514',
      name: 'Claude 4 Opus',
      provider: 'anthropic',
      description: 'Our most powerful and capable model with superior reasoning and advanced coding',
      contextWindow: 200000,
      pricing: { input: 0.015, output: 0.075 },
      capabilities: ['text', 'vision', 'code', 'analysis', 'reasoning', 'extended-thinking'],
      isAvailable: true,
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude 4 Sonnet',
      provider: 'anthropic',
      description: 'High-performance model with exceptional reasoning and efficiency',
      contextWindow: 200000,
      pricing: { input: 0.003, output: 0.015 },
      capabilities: ['text', 'vision', 'code', 'analysis', 'reasoning', 'extended-thinking'],
      isAvailable: true,
    },
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      provider: 'anthropic',
      description: 'High-performance model with early extended thinking capabilities',
      contextWindow: 200000,
      pricing: { input: 0.003, output: 0.015 },
      capabilities: ['text', 'vision', 'code', 'analysis', 'extended-thinking'],
      isAvailable: true,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet (v2)',
      provider: 'anthropic',
      description: 'Our previous intelligent model with enhanced capabilities',
      contextWindow: 200000,
      pricing: { input: 0.003, output: 0.015 },
      capabilities: ['text', 'vision', 'code', 'analysis', 'computer-use'],
      isAvailable: true,
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      description: 'Our fastest model with intelligence at blazing speeds',
      contextWindow: 200000,
      pricing: { input: 0.0008, output: 0.004 },
      capabilities: ['text', 'vision', 'code'],
      isAvailable: true,
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      description: 'Powerful model for complex tasks (legacy)',
      contextWindow: 200000,
      pricing: { input: 0.015, output: 0.075 },
      capabilities: ['text', 'vision', 'code', 'analysis'],
      isAvailable: true,
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      provider: 'anthropic',
      description: 'Fast and compact model for near-instant responsiveness (legacy)',
      contextWindow: 200000,
      pricing: { input: 0.00025, output: 0.00125 },
      capabilities: ['text', 'vision', 'code'],
      isAvailable: true,
    },
  ];

  constructor() {
    super();
    // Initialize client lazily when needed
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.getRequiredApiKey();
      this.client = new Anthropic({
        apiKey,
      });
    }
    return this.client;
  }

  async sendMessage(model: string, messages: ChatMessage[]): Promise<string> {
    try {
      const client = this.getClient();
      // Convert messages to Anthropic format
      const systemMessage = messages.find(m => m.role === 'system');
      const chatMessages = messages
        .filter(m => m.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: this.formatMessageContent(msg),
        }));

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemMessage?.content,
        messages: chatMessages,
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : '';
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatMessageContent(message: ChatMessage): any {
    // If no attachments, return simple text content
    if (!message.attachments || message.attachments.length === 0) {
      return message.content;
    }

    // Build content array with text and attachments
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
      console.log(`[ANTHROPIC] Processing attachment:`, {
        type: attachment.type,
        mimeType: attachment.mimeType,
        dataType: typeof attachment.data,
        dataLength: attachment.data ? attachment.data.length : 0,
        dataPrefix: attachment.data ? attachment.data.substring(0, 50) : 'no data'
      });

      if (attachment.type === 'image' && attachment.data) {
        // Check if data is a URL or base64
        if (attachment.data.startsWith('http://') || attachment.data.startsWith('https://')) {
          // For URL-based images, use the proper URL format
          console.log(`[ANTHROPIC] Using URL image:`, attachment.data);
          contentParts.push({
            type: 'image',
            source: {
              type: 'url',
              url: attachment.data,
            },
          });
        } else {
          // Handle base64 data
          let base64Data: string;
          
          if (attachment.data.startsWith('data:')) {
            // Extract base64 from data URL format (data:image/jpeg;base64,/9j/4AAQ...)
            const base64Part = attachment.data.split(',')[1];
            if (!base64Part) {
              console.warn('Invalid data URL format for image attachment');
              continue;
            }
            base64Data = base64Part;
          } else {
            // Assume it's already base64 encoded
            base64Data = attachment.data;
          }
          
          // Determine media type from mimeType or default to jpeg
          const mediaType = attachment.mimeType || 'image/jpeg';
          
          // Validate media type is supported by Claude
          const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          if (!supportedTypes.includes(mediaType)) {
            console.warn(`Unsupported image media type: ${mediaType}. Claude supports: ${supportedTypes.join(', ')}`);
            continue;
          }
          
          console.log(`[ANTHROPIC] Using base64 image:`, {
            mediaType,
            dataLength: base64Data.length,
            dataPrefix: base64Data.substring(0, 50)
          });

          contentParts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          });
        }
      } else if (attachment.type === 'text') {
        // Handle text attachments by adding them as text content
        contentParts.push({
          type: 'text',
          text: `[File: ${attachment.data}]`,
        });
      }
    }

    // Return array of content parts (Claude expects an array when there are multiple parts)
    return contentParts;
  }

  async *streamMessage(model: string, messages: ChatMessage[]): AsyncIterableIterator<string> {
    try {
      const client = this.getClient();
      // Convert messages to Anthropic format
      const systemMessage = messages.find(m => m.role === 'system');
      const chatMessages = messages
        .filter(m => m.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: this.formatMessageContent(msg),
        }));

      const stream = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemMessage?.content,
        messages: chatMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield chunk.delta.text;
        }
      }
    } catch (error) {
      console.error('Anthropic streaming error:', error);
      throw new Error(`Anthropic streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const client = new Anthropic({ apiKey });
      // Test with a minimal request using the most basic available model
      await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch {
      return false;
    }
  }
} 