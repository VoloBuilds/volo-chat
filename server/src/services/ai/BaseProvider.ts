import { AIModel, ChatMessage } from '../../types/ai';
import { getEnv } from '../../lib/env';

export abstract class BaseAIProvider {
  abstract name: string;
  abstract models: AIModel[];
  
  abstract sendMessage(model: string, messages: ChatMessage[], userId?: string): Promise<string>;
  abstract streamMessage(model: string, messages: ChatMessage[], userId?: string, fileService?: any, env?: any): AsyncIterableIterator<string>;
  abstract validateApiKey(apiKey: string): Promise<boolean>;
  
  protected getApiKey(): string | null {
    const envKey = `${this.name.toUpperCase()}_API_KEY`;
    const key = getEnv(envKey);
    console.log(`Checking API key for ${this.name}: ${envKey} = ${key ? '[PRESENT]' : '[MISSING]'}`);
    return key || null;
  }

  protected getRequiredApiKey(): string {
    const key = this.getApiKey();
    if (!key) {
      throw new Error(`API key not found for ${this.name}`);
    }
    return key;
  }

  hasApiKey(): boolean {
    const hasKey = !!this.getApiKey();
    console.log(`Provider ${this.name} hasApiKey: ${hasKey}`);
    return hasKey;
  }
} 