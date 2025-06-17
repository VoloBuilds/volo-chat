import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider } from '../BaseProvider';
import { AIModel, ChatMessage } from '../../../types/ai';

export class GoogleProvider extends BaseAIProvider {
  name = 'google';
  private client: GoogleGenerativeAI | null = null;

  models: AIModel[] = [
    {
      id: 'gemini-2.5-pro-preview-06-05',
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      description: 'Our most powerful thinking model with maximum response accuracy and state-of-the-art performance',
      contextWindow: 1048576,
      pricing: { input: 0.00125, output: 0.005 },
      capabilities: ['text', 'vision', 'audio', 'video', 'code', 'reasoning', 'thinking'],
      isAvailable: true,
    },
    {
      id: 'gemini-2.5-flash-preview-05-20',
      name: 'Gemini 2.5 Flash',
      provider: 'google',
      description: 'Our best model in terms of price-performance, offering well-rounded capabilities with thinking',
      contextWindow: 1048576,
      pricing: { input: 0.000075, output: 0.0003 },
      capabilities: ['text', 'vision', 'audio', 'video', 'code', 'thinking'],
      isAvailable: true,
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      provider: 'google',
      description: 'Our newest multimodal model with next generation features and improved capabilities',
      contextWindow: 1048576,
      pricing: { input: 0.000075, output: 0.0003 },
      capabilities: ['text', 'vision', 'audio', 'video', 'code', 'tool-use', 'agentic'],
      isAvailable: true,
    },
    {
      id: 'gemini-2.0-flash-lite',
      name: 'Gemini 2.0 Flash Lite',
      provider: 'google',
      description: 'Cost-efficient model optimized for low latency and high volume tasks',
      contextWindow: 1048576,
      pricing: { input: 0.000037, output: 0.00015 },
      capabilities: ['text', 'vision', 'audio', 'video', 'code'],
      isAvailable: true,
    },
    {
      id: 'gemini-1.5-pro-latest',
      name: 'Gemini 1.5 Pro',
      provider: 'google',
      description: 'Mid-size multimodal model optimized for complex reasoning tasks',
      contextWindow: 2097152,
      pricing: { input: 0.00125, output: 0.005 },
      capabilities: ['text', 'vision', 'audio', 'video', 'code'],
      isAvailable: true,
    },
    {
      id: 'gemini-1.5-flash-latest',
      name: 'Gemini 1.5 Flash',
      provider: 'google',
      description: 'Fast and versatile multimodal model for scaling across diverse tasks',
      contextWindow: 1048576,
      pricing: { input: 0.000075, output: 0.0003 },
      capabilities: ['text', 'vision', 'audio', 'video', 'code'],
      isAvailable: true,
    },
    {
      id: 'gemini-1.5-flash-8b-latest',
      name: 'Gemini 1.5 Flash 8B',
      provider: 'google',
      description: 'Small model designed for high volume and lower intelligence tasks',
      contextWindow: 1048576,
      pricing: { input: 0.0000375, output: 0.00015 },
      capabilities: ['text', 'vision', 'audio', 'video', 'code'],
      isAvailable: true,
    },
  ];

  constructor() {
    super();
    // Initialize client lazily when needed
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = this.getRequiredApiKey();
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  async sendMessage(model: string, messages: ChatMessage[]): Promise<string> {
    try {
      const client = this.getClient();
      const genModel = client.getGenerativeModel({ model });
      
      // Convert chat history to Google format
      const history = messages.slice(0, -1).map(msg => this.formatMessageForHistory(msg));

      const lastMessage = messages[messages.length - 1];
      const lastMessageContent = this.formatMessageContent(lastMessage);
      
      const chat = genModel.startChat({ history });
      const result = await chat.sendMessage(lastMessageContent);
      
      return result.response.text();
    } catch (error) {
      console.error('Google API error:', error);
      throw new Error(`Google API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *streamMessage(model: string, messages: ChatMessage[]): AsyncIterableIterator<string> {
    try {
      const client = this.getClient();
      const genModel = client.getGenerativeModel({ model });
      
      // Convert chat history to Google format
      const history = messages.slice(0, -1).map(msg => this.formatMessageForHistory(msg));

      const lastMessage = messages[messages.length - 1];
      const lastMessageContent = this.formatMessageContent(lastMessage);
      
      const chat = genModel.startChat({ history });
      const result = await chat.sendMessageStream(lastMessageContent);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      console.error('Google streaming error:', error);
      throw new Error(`Google streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatMessageForHistory(message: ChatMessage): any {
    return {
      role: message.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: this.formatMessageParts(message),
    };
  }

  private formatMessageContent(message: ChatMessage): any {
    const parts = this.formatMessageParts(message);
    return parts.length === 1 && parts[0].text ? parts[0].text : parts;
  }

  private formatMessageParts(message: ChatMessage): any[] {
    const parts: any[] = [];

    // Add text content if present
    if (message.content.trim()) {
      parts.push({ text: message.content });
    }

    // Add image attachments
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        console.log(`[GOOGLE] Processing attachment:`, {
          type: attachment.type,
          mimeType: attachment.mimeType,
          dataType: typeof attachment.data,
          dataLength: attachment.data ? attachment.data.length : 0,
          dataPrefix: attachment.data ? attachment.data.substring(0, 50) : 'no data'
        });

        if (attachment.type === 'image' && attachment.data) {
          // Handle base64 data - Gemini expects raw base64 without data URL prefix
          let base64Data: string;
          
          if (attachment.data.startsWith('data:')) {
            // Extract base64 from data URL format (data:image/jpeg;base64,/9j/4AAQ...)
            const base64Part = attachment.data.split(',')[1];
            if (!base64Part) {
              console.warn('Invalid data URL format for image attachment');
              continue;
            }
            base64Data = base64Part;
          } else if (attachment.data.startsWith('http://') || attachment.data.startsWith('https://')) {
            // URL format - Gemini could potentially handle this, but we're using base64
            console.warn('URL format not implemented for Google provider, skipping attachment');
            continue;
          } else {
            // Assume it's already raw base64 encoded
            base64Data = attachment.data;
          }
          
          // Determine media type from mimeType or default to jpeg
          const mimeType = attachment.mimeType || 'image/jpeg';
          
          // Validate media type is supported by Gemini
          const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
          if (!supportedTypes.includes(mimeType)) {
            console.warn(`Unsupported image media type: ${mimeType}. Gemini supports: ${supportedTypes.join(', ')}`);
            continue;
          }
          
          console.log(`[GOOGLE] Using base64 image:`, {
            mimeType,
            dataLength: base64Data.length,
            dataPrefix: base64Data.substring(0, 50)
          });

          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          });
        }
      }
    }

    return parts;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const client = new GoogleGenerativeAI(apiKey);
      const model = client.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      await model.generateContent('test');
      return true;
    } catch {
      return false;
    }
  }
} 