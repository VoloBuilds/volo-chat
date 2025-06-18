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
  
  // Sharing fields
  isShared?: boolean;
  shareId?: string;
  sharedAt?: Date;
  
  // Branching fields
  isBranched?: boolean;
  branchPointMessageId?: string;
  branchedAt?: Date;
  
  // Common field
  originalChatId?: string;
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
  type?: 'file' | 'branch_link';
  originalChatId?: string;
  branchPointMessageId?: string;
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

export interface SharedChatResponse {
  chat: {
    id: string;
    title: string;
    modelId: string;
    createdAt: Date;
    messageCount: number;
  };
  messages: Message[];
}

export interface BranchedChatResponse {
  chat: Chat;
  messages: Message[];
  branchPoint: {
    messageId: string;
    originalChatId: string;
  };
}

export interface BranchResponse {
  chat: Chat;
  branchPoint: {
    messageId: string;
    originalChatId: string;
  };
  message: string;
}

export interface ChatMetadata {
  chat: Chat;
  originalChat?: Chat;
  branches: Chat[];
  isBranched: boolean;
  hasOriginal: boolean;
  branchCount: number;
} 