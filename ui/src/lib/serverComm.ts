import { getAuth } from 'firebase/auth';
import { app } from './firebase';
import { AIModel, Chat, Message, Attachment } from '../types/chat';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

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
  return user.getIdToken();
}

async function fetchWithAuth(
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
  const response = await fetchWithAuth('/api/v1/models');
  const data = await response.json();
  // Backend returns { models: [...], providers: [...] }
  return data.models || [];
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
    modelId: 'gemini-1.5-flash', // Default model
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
                            
                          case 'stream_error':
                            throw new Error(eventData.error || 'Streaming error occurred');
                        }
                      }
                    } catch (parseError) {
                      // Log more detailed parse error info
                      console.warn('Failed to parse SSE event:', {
                        line: line,
                        error: parseError instanceof Error ? parseError.message : parseError
                      });
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
  
  // Chat messaging
  sendChatMessage,
  streamChatResponse,
  streamChatResponseFallback,
  createChatWebSocket,
  generateTitle,
  
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
}; 