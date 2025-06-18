import { getAuth } from 'firebase/auth';
import { app } from './firebase';
import { AIModel, Chat, Message, Attachment, BranchResponse, ChatMetadata, SharedChatResponse } from '../types/chat';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://volo-chat-api.volobuilds1.workers.dev';

class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function getAuthToken(): Promise<string | null> {
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  try {
    return await user.getIdToken();
  } catch (error) {
    console.warn('Failed to get auth token:', error);
    return null;
  }
}

export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      // Keep the default error message if JSON parsing fails
    }
    throw new APIError(response.status, errorMessage);
  }

  return response;
}

// Model endpoints
export async function getAvailableModels(): Promise<AIModel[]> {
  try {
    const response = await fetchWithAuth('/api/v1/models');
    const data = await response.json();
    // Backend returns { models: [...], providers: [...] }
    return data.models || [];
  } catch (error) {
    console.warn('Failed to fetch models with auth, trying without auth:', error);
    
    // Fallback: try without authentication for public models endpoint
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/models`);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (fallbackError) {
      console.error('Failed to fetch models even without auth:', fallbackError);
      throw fallbackError;
    }
  }
}

export async function getModelDetails(modelId: string): Promise<AIModel> {
  const response = await fetchWithAuth(`/api/v1/models/${modelId}`);
  const data = await response.json();
  // Backend returns { model: {...} }
  return data.model;
}

// Chat endpoints
export async function getChats(): Promise<Chat[]> {
  const response = await fetchWithAuth('/api/v1/chats');
  const data = await response.json();
  // Backend returns { chats: [...] }
  return data.chats || [];
}

export async function createChat(data: { title: string; modelId: string }): Promise<Chat> {
  const response = await fetchWithAuth('/api/v1/chats', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  // Backend returns { chat: {...} }
  return result.chat;
}

export async function getChat(chatId: string): Promise<{ chat: Chat; messages: Message[] }> {
  const response = await fetchWithAuth(`/api/v1/chats/${chatId}`);
  const data = await response.json();
  // Backend returns { chat: {...}, messages: [...] }
  return {
    chat: data.chat,
    messages: data.messages || []
  };
}

export async function updateChat(chatId: string, data: { title: string }): Promise<Chat> {
  const response = await fetchWithAuth(`/api/v1/chats/${chatId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  // Backend returns { chat: {...} }
  return result.chat;
}

export async function updateChatTitle(chatId: string, title: string): Promise<Chat> {
  return updateChat(chatId, { title });
}

export async function deleteChat(chatId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/chats/${chatId}`, {
    method: 'DELETE',
  });
  // Backend returns { success: true }
}

// Message endpoints (these are handled by the chat endpoints now)
export async function getMessages(chatId: string): Promise<Message[]> {
  const { messages } = await getChat(chatId);
  return messages;
}

export async function sendMessage(chatId: string, data: { 
  content: string; 
  role?: 'user' | 'assistant' | 'system'; 
  attachments?: Attachment[] 
}): Promise<Message> {
  const response = await sendChatMessage({
    chatId,
    content: data.content,
    modelId: 'google/gemini-2.5-flash-lite-preview-06-17', // Default model
    attachments: data.attachments
  });
  return response.userMessage;
}

export async function updateMessage(messageId: string, data: { content: string }): Promise<Message> {
  const response = await fetchWithAuth(`/api/v1/messages/${messageId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  // Backend returns { message: {...} }
  return result.message;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/messages/${messageId}`, {
    method: 'DELETE',
  });
  // Backend returns { success: true }
}

// Chat messaging endpoints - Non-streaming version for better reliability
export async function sendChatMessage(data: {
  chatId: string;
  content: string;
  modelId: string;
  attachments?: Attachment[];
}): Promise<{ userMessage: Message; assistantMessage: Message }> {
  const chatId = data.chatId;
  
  const response = await fetchWithAuth(`/api/v1/chats/${chatId}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: data.content,
      modelId: data.modelId,
      attachments: data.attachments
    }),
  });
  const result = await response.json();
  // Backend returns { userMessage: {...}, assistantMessage: {...} }
  return {
    userMessage: result.userMessage,
    assistantMessage: result.assistantMessage
  };
}

export async function generateTitle(data: {
  chatId: string;
  content: string;
  modelId: string;
}): Promise<{ title: string }> {
  const response = await fetchWithAuth(`/api/v1/chats/${data.chatId}/generate-title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: data.content,
      modelId: data.modelId
    }),
  });
  const result = await response.json();
  // Backend returns { title: "..." }
  return result;
}

export async function cancelStream(data: {
  chatId: string;
  partialContent: string;
  modelId: string;
}): Promise<{ message: any; cancelled: boolean }> {
  const response = await fetchWithAuth(`/api/v1/chats/${data.chatId}/cancel-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      partialContent: data.partialContent,
      modelId: data.modelId
    }),
  });
  const result = await response.json();
  // Backend returns { message: {...}, cancelled: true }
  return result;
}

// Enhanced debugging for streaming
const debugStreaming = (message: string, data?: any) => {
  console.log(`[STREAMING] ${message}`, data);
};

// Streaming utilities - HTTP-based streaming (SSE) for development compatibility
export function streamChatResponse(data: {
  chatId: string;
  content: string;
  modelId: string;
  attachments?: Attachment[];
  abortController?: AbortController;
}): Promise<AsyncIterableIterator<string>> {
  return new Promise<AsyncIterableIterator<string>>((resolve, reject) => {
    const chunks: string[] = [];
    let isComplete = false;
    let currentIndex = 0;
    let chunkCount = 0;

    debugStreaming('Starting HTTP streaming', { 
      chatId: data.chatId, 
      modelId: data.modelId,
      contentLength: data.content.length 
    });

    // Use HTTP-based streaming (Server-Sent Events) which works better with Wrangler dev
    const startHttpStreaming = async () => {
      try {
        const chatId = data.chatId;
        
        const response = await fetchWithAuth(`/api/v1/chats/${chatId}/stream-http`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            content: data.content,
            modelId: data.modelId,
            attachments: data.attachments
          }),
          signal: data.abortController?.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }

        const decoder = new TextDecoder();
        let buffer = ''; // Buffer to handle incomplete SSE events
        
        // Process the stream
        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                debugStreaming('Stream reading complete');
                isComplete = true;
                break;
              }

                // Add new data to buffer
                buffer += decoder.decode(value, { stream: true });
                
                // Process complete lines from buffer
                const lines = buffer.split('\n');
                
                // Keep the last incomplete line in buffer
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const jsonData = line.slice(6).trim();
                      if (jsonData) {
                        const eventData = JSON.parse(jsonData);
                        
                        switch (eventData.type) {
                          case 'user_message':
                            // User message confirmed
                            debugStreaming('User message confirmed', { id: eventData.message?.id });
                            break;
                            
                          case 'stream_start':
                            // AI response started
                            debugStreaming('Stream started', { timestamp: eventData.timestamp });
                            break;
                            
                          case 'stream_chunk':
                            // New content chunk received
                            if (eventData.chunk) {
                              chunkCount++;
                              chunks.push(eventData.chunk);
                              // debugStreaming('Chunk received', { 
                              //   chunkNumber: chunkCount, 
                              //   chunkLength: eventData.chunk.length,
                              //   totalChunks: chunks.length 
                              // });
                            }
                            break;


                            
                          case 'stream_end':
                            // AI response complete
                            debugStreaming('Stream ended', { 
                              messageId: eventData.message?.id,
                              totalChunks: chunks.length,
                              totalLength: chunks.join('').length
                            });
                            isComplete = true;
                            return;
                            
                          case 'stream_cancelled':
                            // AI response cancelled
                            debugStreaming('Stream cancelled', { 
                              messageId: eventData.message?.id,
                              totalChunks: chunks.length,
                              totalLength: chunks.join('').length,
                              cancelled: eventData.cancelled
                            });
                            isComplete = true;
                            return;
                            
                          case 'stream_error':
                            // Log the full error data for debugging
                            debugStreaming('Received stream_error event', eventData);
                            
                            // Instead of throwing, treat the error as the final message content
                            const errorMessage = eventData.error || 'An error occurred during streaming';
                            chunks.push(errorMessage);
                            
                            // Mark stream as complete
                            isComplete = true;
                            return;
                        }
                      }
                    } catch (parseError) {
                      // Handle JSON parsing failures more robustly
                      console.warn('Failed to parse SSE event:', {
                        line: line,
                        jsonData: line.slice(6).trim(),
                        error: parseError instanceof Error ? parseError.message : parseError,
                      });
                      
                      // If this is a stream_error line that failed to parse, extract the error message
                      if (line.includes('"type":"stream_error"')) {
                        console.warn('Detected malformed stream_error event, attempting extraction');
                        
                        // Enhanced error extraction with multiple fallback patterns
                        let extractedError = 'Error occurred during streaming';
                        
                        // Try multiple regex patterns to extract the error message
                        const patterns = [
                          // Standard JSON error field pattern
                          /"error":"([^"]+(?:\\.[^"]*)*?)"/,
                          // Fallback pattern for truncated JSON
                          /"error":"([^"]*)/,
                          // Look for any error-like content in the message
                          /(\d{3}\s+[^"]+(?:https?:\/\/[^\s"]+)?[^"]*)/
                        ];
                        
                        for (const pattern of patterns) {
                          const match = line.match(pattern);
                          if (match && match[1]) {
                            // Unescape JSON escape sequences
                            extractedError = match[1]
                              .replace(/\\"/g, '"')
                              .replace(/\\\\/g, '\\')
                              .replace(/\\n/g, '\n')
                              .replace(/\\r/g, '\r')
                              .replace(/\\t/g, '\t');
                            break;
                          }
                        }
                        
                        console.log('Extracted error message:', extractedError);
                        
                        // Instead of throwing, treat the extracted error as final message content
                        chunks.push(extractedError);
                        isComplete = true;
                        return;
                      }
                      
                      // For other JSON parsing errors, continue processing - don't break the stream
                      console.log('Continuing with non-error JSON parsing failure');
                    }
                  } else if (line.trim() === '') {
                    // Empty line indicates end of SSE event - this is normal
                    continue;
                  }
                }
            }
          } catch (streamError) {
            console.error('Stream processing error:', streamError);
            reject(streamError);
          }
        };

        // Start processing the stream
        processStream();

        // Return the async iterator
        const iterator: AsyncIterableIterator<string> = {
          [Symbol.asyncIterator]: function() { return this; },
          next: async function(): Promise<IteratorResult<string>> {
            while (currentIndex < chunks.length || !isComplete) {
              if (currentIndex < chunks.length) {
                const value = chunks[currentIndex];
                currentIndex++;
                return { value, done: false };
              } else {
                // Wait a bit before checking for new chunks
                await new Promise(resolve => setTimeout(resolve, 10));
              }
            }
            debugStreaming('Iterator complete', { 
              totalChunksProcessed: currentIndex,
              totalChunksReceived: chunks.length 
            });
            return { value: undefined, done: true };
          }
        };
        
        resolve(iterator);

      } catch (error) {
        // Handle abort/cancellation gracefully
        if (error instanceof Error && error.name === 'AbortError') {
          debugStreaming('Stream aborted by user', error);
          isComplete = true;
          // Create a special iterator that indicates cancellation
          const cancelledIterator: AsyncIterableIterator<string> = {
            [Symbol.asyncIterator]: function() { return this; },
            next: async function(): Promise<IteratorResult<string>> {
              return { value: undefined, done: true };
            }
          };
          resolve(cancelledIterator);
          return;
        }
        
        debugStreaming('HTTP streaming failed, falling back', { error: error instanceof Error ? error.message : error });
        resolve(streamChatResponseFallback(data));
      }
    };

    startHttpStreaming();
  });
}

// WebSocket streaming for real-time responses (Enhanced version)
export function createChatWebSocket(chatId: string): WebSocket | null {
  try {
    const wsUrl = API_BASE_URL.replace('http', 'ws').replace('https', 'wss');
    const ws = new WebSocket(`${wsUrl}/api/v1/chats/${chatId}/stream`);
    
    return ws;
  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
    return null;
  }
}

// Alternative simpler streaming function for fallback
export async function* streamChatResponseFallback(data: {
  chatId: string;
  content: string;
  modelId: string;
  attachments?: Attachment[];
}): AsyncIterableIterator<string> {
  // Fallback to non-streaming approach with simulated streaming
  const chatResponse = await sendChatMessage(data);
  const content = chatResponse.assistantMessage.content;
  
  // Simulate streaming by yielding content in natural chunks
  const sentences = content.split(/(?<=[.!?])\s+/);
  
  for (const sentence of sentences) {
    yield sentence + ' ';
    // Add a more natural delay based on sentence length
    await new Promise(resolve => setTimeout(resolve, Math.min(200, sentence.length * 10)));
  }
}

// File endpoints
export async function uploadFile(file: File): Promise<Attachment> {
  console.log('[API-CLIENT] uploadFile called:', {
    name: file.name,
    type: file.type,
    size: file.size
  });

  const formData = new FormData();
  formData.append('file', file);

  console.log('[API-CLIENT] Making upload request to /api/v1/files/upload');
  const response = await fetchWithAuth('/api/v1/files/upload', {
    method: 'POST',
    body: formData,
  });
  
  console.log('[API-CLIENT] Upload response status:', response.status);
  const result = await response.json();
  
  console.log('[API-CLIENT] Upload successful:', {
    id: result.file?.id,
    filename: result.file?.filename,
    status: result.file?.status
  });

  // Backend returns { file: {...} }
  return result.file;
}

export async function commitFilesToR2(fileIds: string[]): Promise<void> {
  console.log('[API-CLIENT] commitFilesToR2 called:', { fileIds });

  const response = await fetchWithAuth('/api/v1/files/commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileIds }),
  });
  
  console.log('[API-CLIENT] Commit response status:', response.status);
  
  if (!response.ok) {
    console.error('[API-CLIENT] Failed to commit files:', response.statusText);
    throw new Error(`Failed to commit files: ${response.statusText}`);
  }

  console.log('[API-CLIENT] Files committed to R2 successfully');
}

export async function getFile(fileId: string): Promise<Blob> {
  const response = await fetchWithAuth(`/api/v1/files/${fileId}`);
  return response.blob();
}

export async function getFileInfo(fileId: string): Promise<Attachment> {
  const response = await fetchWithAuth(`/api/v1/files/${fileId}/info`);
  const data = await response.json();
  // Backend returns { file: {...} }
  return data.file;
}

export async function getUserFiles(): Promise<Attachment[]> {
  const response = await fetchWithAuth('/api/v1/files');
  const data = await response.json();
  // Backend returns { files: [...] }
  return data.files || [];
}

export async function deleteFile(fileId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/files/${fileId}`, {
    method: 'DELETE',
  });
  // Backend returns { success: true }
}

export async function debugFile(fileId: string): Promise<any> {
  const response = await fetchWithAuth(`/api/v1/files/debug/${fileId}`);
  return response.json();
}

export async function processFile(fileId: string): Promise<{ processedText: string; file: Attachment }> {
  const response = await fetchWithAuth(`/api/v1/files/${fileId}/process`, {
    method: 'POST',
  });
  const result = await response.json();
  // Backend returns { file: {...}, processedContent: "...", message: "..." }
  return {
    processedText: result.processedContent,
    file: result.file
  };
}

// User endpoints
export async function getCurrentUser() {
  const response = await fetchWithAuth('/api/v1/protected/me');
  return response.json();
}

export async function getUserPinnedChats(): Promise<string[]> {
  const response = await fetchWithAuth('/api/v1/user/pinned-chats');
  const data = await response.json();
  return data.pinnedChats || [];
}

export async function pinChat(chatId: string): Promise<string[]> {
  const response = await fetchWithAuth(`/api/v1/user/pin-chat/${chatId}`, {
    method: 'POST',
  });
  const data = await response.json();
  return data.pinnedChats || [];
}

export async function unpinChat(chatId: string): Promise<string[]> {
  const response = await fetchWithAuth(`/api/v1/user/pin-chat/${chatId}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  return data.pinnedChats || [];
}

// Common chat operations that both features use

export interface ChatCopyResponse {
  chat: Chat;
  copiedMessageCount: number;
  message?: string;
}



// Chat branching functions
export async function branchChatFromMessage(
  chatId: string, 
  messageId: string
): Promise<BranchResponse> {
  const response = await fetchWithAuth(`/api/v1/chats/${chatId}/branch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messageId }),
  });
  const result = await response.json();
  return result;
}

export async function getChatBranches(chatId: string): Promise<Chat[]> {
  const response = await fetchWithAuth(`/api/v1/chats/${chatId}/branches`);
  const data = await response.json();
  return data.branches || [];
}

export async function getChatMetadata(chatId: string): Promise<ChatMetadata> {
  const response = await fetchWithAuth(`/api/v1/chats/${chatId}/metadata`);
  return response.json();
}

// Chat sharing functions
export async function shareChat(chatId: string): Promise<{ chat: Chat; shareUrl: string }> {
  const response = await fetchWithAuth(`/api/v1/chats/${chatId}/share`, {
    method: 'POST',
  });
  const result = await response.json();
  return {
    chat: result.chat,
    shareUrl: result.shareUrl,
  };
}

export async function revokeShareChat(chatId: string): Promise<void> {
  await fetchWithAuth(`/api/v1/chats/${chatId}/share`, {
    method: 'DELETE',
  });
}

export async function getSharedChat(shareId: string): Promise<SharedChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/shared/${shareId}`);
  
  if (!response.ok) {
    throw new APIError(response.status, 'Failed to fetch shared chat');
  }
  
  return response.json();
}

export async function getSharedChatFile(shareId: string, fileId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/shared/${shareId}/files/${fileId}`);
  
  if (!response.ok) {
    throw new APIError(response.status, 'Failed to fetch shared chat file');
  }
  
  return response.blob();
}

export async function importSharedChat(shareId: string): Promise<Chat> {
  const response = await fetchWithAuth(`/api/v1/shared/${shareId}/import`, {
    method: 'POST',
  });
  const result = await response.json();
  return result.chat;
}

// Helper for generating titles
export function generateChatTitle(originalTitle: string, type: 'shared' | 'branched'): string {
  const suffix = type === 'shared' ? '(Shared)' : '(Branch)';
  return originalTitle.includes(suffix) ? originalTitle : `${originalTitle} ${suffix}`;
}

// Helper for checking if chat is a copy
export function isCopiedChat(chat: Chat): boolean {
  return !!(chat.originalChatId && (chat.isBranched || !chat.isShared));
}

// Helper for getting copy type
export function getChatCopyType(chat: Chat): 'shared' | 'branched' | 'original' {
  if (!chat.originalChatId) return 'original';
  return chat.isBranched ? 'branched' : 'shared';
}

export async function upgradeUserAccount(userData: {
  email: string;
  displayName?: string;
  photoURL?: string;
}): Promise<{ user: any; message: string }> {
  const response = await fetchWithAuth('/api/v1/user/upgrade-account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });
  const result = await response.json();
  return result;
}

// Export the main API object
export const api = {
  // Models
  getAvailableModels,
  getModelDetails,
  
  // Chats
  getChats,
  createChat,
  getChat,
  updateChat,
  updateChatTitle,
  deleteChat,
  
  // Messages
  getMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  retryMessage,
  
  // Chat messaging
  sendChatMessage,
  streamChatResponse,
  streamChatResponseFallback,
  createChatWebSocket,
  generateTitle,
  cancelStream,
  
  // Files
  uploadFile,
  commitFilesToR2,
  getFile,
  getFileInfo,
  getUserFiles,
  deleteFile,
  debugFile,
  processFile,
  
  // User
  getCurrentUser,
  getUserPinnedChats,
  pinChat,
  unpinChat,
  upgradeUserAccount,
  
  // Common patterns (will be extended by features)
  generateChatTitle,
  isCopiedChat,
  getChatCopyType,
  
  // Chat branching
  branchChatFromMessage,
  getChatBranches,
  getChatMetadata,
  
  // Chat sharing
  shareChat,
  revokeShareChat,
  getSharedChat,
  getSharedChatFile,
  importSharedChat,
}; 

export async function retryMessage(data: {
  chatId: string;
  messageId: string;
}): Promise<AsyncIterableIterator<string>> {
  return new Promise<AsyncIterableIterator<string>>((resolve, reject) => {
    const chunks: string[] = [];
    let isComplete = false;
    let currentIndex = 0;
    let chunkCount = 0;

    debugStreaming('Starting retry streaming', { 
      chatId: data.chatId, 
      messageId: data.messageId 
    });

    // Use HTTP-based streaming (Server-Sent Events) for retry
    const startRetryStreaming = async () => {
      try {
        const response = await fetchWithAuth(`/api/v1/chats/${data.chatId}/messages/${data.messageId}/retry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
        });

        if (!response.ok) {
          // Check if this is a non-streaming response (like image generation)
          if (response.headers.get('content-type')?.includes('application/json')) {
            const result = await response.json();
            if (result.type === 'image_generation' || result.type === 'image_generation_error') {
              // For image generation, return the content as a single chunk
              chunks.push(result.message.content);
              isComplete = true;
              
              const iterator: AsyncIterableIterator<string> = {
                [Symbol.asyncIterator]: function() { return this; },
                next: async function(): Promise<IteratorResult<string>> {
                  if (currentIndex < chunks.length) {
                    const value = chunks[currentIndex];
                    currentIndex++;
                    return { value, done: false };
                  } else {
                    return { value: undefined, done: true };
                  }
                }
              };
              
              resolve(iterator);
              return;
            }
          }
          
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }

        const decoder = new TextDecoder();
        let buffer = ''; // Buffer to handle incomplete SSE events
        
        // Process the stream
        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                debugStreaming('Retry stream reading complete');
                isComplete = true;
                break;
              }

              // Add new data to buffer
              buffer += decoder.decode(value, { stream: true });
              
              // Process complete lines from buffer
              const lines = buffer.split('\n');
              
              // Keep the last incomplete line in buffer
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const jsonData = line.slice(6).trim();
                    if (jsonData) {
                      const eventData = JSON.parse(jsonData);
                      
                      switch (eventData.type) {
                        case 'stream_chunk':
                          // New content chunk received
                          if (eventData.chunk) {
                            chunkCount++;
                            chunks.push(eventData.chunk);
                          }
                          break;
                          
                        case 'stream_end':
                          // AI response complete
                          debugStreaming('Retry stream ended', { 
                            messageId: eventData.message?.id,
                            totalChunks: chunks.length,
                            totalLength: chunks.join('').length
                          });
                          isComplete = true;
                          return;
                          
                        case 'stream_cancelled':
                          // AI response cancelled
                          debugStreaming('Retry stream cancelled', { 
                            messageId: eventData.message?.id,
                            totalChunks: chunks.length,
                            totalLength: chunks.join('').length,
                            cancelled: eventData.cancelled
                          });
                          isComplete = true;
                          return;
                          
                        case 'stream_error':
                          // Log the full error data for debugging
                          debugStreaming('Received retry stream_error event', eventData);
                          
                          // Instead of throwing, treat the error as the final message content
                          const errorMessage = eventData.error || 'An error occurred during retry';
                          chunks.push(errorMessage);
                          
                          // Mark stream as complete
                          isComplete = true;
                          return;
                      }
                    }
                  } catch (parseError) {
                    // Handle JSON parsing failures more robustly
                    console.warn('Failed to parse retry SSE event:', {
                      line: line,
                      jsonData: line.slice(6).trim(),
                      error: parseError instanceof Error ? parseError.message : parseError,
                    });
                    
                    // If this is a stream_error line that failed to parse, extract the error message
                    if (line.includes('"type":"stream_error"')) {
                      console.warn('Detected malformed retry stream_error event, attempting extraction');
                      
                      // Enhanced error extraction with multiple fallback patterns
                      let extractedError = 'Error occurred during retry';
                      
                      // Try multiple regex patterns to extract the error message
                      const patterns = [
                        // Standard JSON error field pattern
                        /"error":"([^"]+(?:\\.[^"]*)*?)"/,
                        // Fallback pattern for truncated JSON
                        /"error":"([^"]*)/,
                        // Look for any error-like content in the message
                        /(\d{3}\s+[^"]+(?:https?:\/\/[^\s"]+)?[^"]*)/
                      ];
                      
                      for (const pattern of patterns) {
                        const match = line.match(pattern);
                        if (match && match[1]) {
                          // Unescape JSON escape sequences
                          extractedError = match[1]
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\')
                            .replace(/\\n/g, '\n')
                            .replace(/\\r/g, '\r')
                            .replace(/\\t/g, '\t');
                          break;
                        }
                      }
                      
                      console.log('Extracted retry error message:', extractedError);
                      
                      // Instead of throwing, treat the extracted error as final message content
                      chunks.push(extractedError);
                      isComplete = true;
                      return;
                    }
                    
                    // For other JSON parsing errors, continue processing - don't break the stream
                    console.log('Continuing with non-error JSON parsing failure in retry');
                  }
                } else if (line.trim() === '') {
                  // Empty line indicates end of SSE event - this is normal
                  continue;
                }
              }
            }
          } catch (streamError) {
            console.error('Retry stream processing error:', streamError);
            reject(streamError);
          }
        };

        // Start processing the stream
        processStream();

        // Return the async iterator
        const iterator: AsyncIterableIterator<string> = {
          [Symbol.asyncIterator]: function() { return this; },
          next: async function(): Promise<IteratorResult<string>> {
            while (currentIndex < chunks.length || !isComplete) {
              if (currentIndex < chunks.length) {
                const value = chunks[currentIndex];
                currentIndex++;
                return { value, done: false };
              } else {
                // Wait a bit before checking for new chunks
                await new Promise(resolve => setTimeout(resolve, 10));
              }
            }
            debugStreaming('Retry iterator complete', { 
              totalChunksProcessed: currentIndex,
              totalChunksReceived: chunks.length 
            });
            return { value: undefined, done: true };
          }
        };
        
        resolve(iterator);

      } catch (error) {
        debugStreaming('Retry streaming failed', { error: error instanceof Error ? error.message : error });
        reject(error);
      }
    };

    startRetryStreaming();
  });
} 