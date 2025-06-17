export interface AIModel {
  id: string;
  name: string;
  provider: 'openrouter' | 'deepseek';
  description: string;
  contextWindow: number;
  pricing: {
    input: number;
    output: number;
  };
  capabilities: string[];
  isAvailable: boolean;
  originalProvider?: string; // Track underlying provider when using OpenRouter
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