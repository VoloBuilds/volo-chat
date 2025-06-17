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
  originalProvider?: string;
}

export interface Chat {
  id: string;
  title: string;
  userId: string;
  modelId: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  modelId?: string;
  attachments?: Attachment[];
  createdAt: Date;
  isStreaming?: boolean;
  isOptimistic?: boolean;
}

export interface Attachment {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  url?: string;
  status?: 'pending' | 'uploading' | 'uploaded' | 'error';
  file?: File;
  previewUrl?: string;
}

export interface UploadProgress {
  fileId: string;
  filename: string;
  progress: number;
  speed?: number;
  eta?: number;
}

export interface UploadResult {
  file: File;
  attachment?: Attachment;
  error?: string;
} 