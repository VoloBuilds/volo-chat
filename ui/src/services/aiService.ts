import { AIModel, Attachment } from '../types/chat';
import { api } from '../lib/serverComm';

export class AIService {
  async getAvailableModels(): Promise<AIModel[]> {
    try {
      return await api.getAvailableModels();
    } catch (error) {
      console.error('Error fetching models:', error);
      throw error;
    }
  }

  async sendMessage(chatId: string, message: string, modelId: string): Promise<void> {
    try {
      await api.sendChatMessage({
        chatId,
        content: message,
        modelId,
      });
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async *streamMessage(
    chatId: string, 
    message: string, 
    modelId: string, 
    attachments?: Attachment[]
  ): AsyncIterableIterator<string> {
    try {
      const iterator = await api.streamChatResponse({
        chatId,
        content: message,
        modelId,
        attachments,
      });
      yield* iterator;
    } catch (error) {
      console.error('Error streaming message:', error);
      throw error;
    }
  }

  async uploadFile(file: File): Promise<Attachment> {
    try {
      return await api.uploadFile(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async commitFilesToR2(fileIds: string[]): Promise<void> {
    try {
      await api.commitFilesToR2(fileIds);
    } catch (error) {
      console.error('Error committing files to R2:', error);
      throw error;
    }
  }

  async generateChatTitle(chatId: string, firstMessage: string): Promise<string> {
    try {
      // Send the actual message content to the improved title generation endpoint
      const response = await api.generateTitle({
        chatId,
        content: firstMessage,
        modelId: 'google/gemini-2.5-flash-lite-preview-06-17' // Use the correct default model
      });
      
      return response.title || 'New Chat';
    } catch (error) {
      console.error('Error generating chat title:', error);
      // Fallback to a simple title based on the first few words
      const words = firstMessage.trim().split(' ').slice(0, 4);
      return words.join(' ') + (firstMessage.split(' ').length > 4 ? '...' : '');
    }
  }
}

export const aiService = new AIService(); 