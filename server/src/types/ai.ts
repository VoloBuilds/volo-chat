export interface AIModel {
  id: string;
  name: string;
  provider: 'openrouter' | 'deepseek' | 'openai';
  description: string;
  contextWindow: number;
  pricing: {
    input: number;
    output: number;
  };
  capabilities: string[];
  isAvailable: boolean;
  originalProvider?: string; // Track underlying provider when using OpenRouter
  type?: 'text' | 'image' | 'multimodal'; // Model type
  imageOptions?: {
    supportedSizes: string[];
    maxImages: number;
    supportedFormats: string[];
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{
    type: 'image' | 'text' | 'pdf';
    data: string;
    mimeType?: string;
  }>;
}

export interface ProviderError extends Error {
  provider: string;
  retryable: boolean;
  statusCode?: number;
} 