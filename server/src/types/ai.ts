export interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek';
  description: string;
  contextWindow: number;
  pricing: {
    input: number;
    output: number;
  };
  capabilities: string[];
  isAvailable: boolean;
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