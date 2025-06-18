import { fetchWithAuth } from '@/lib/serverComm';

export interface ApiKeyStatus {
  hasKey: boolean;
  isValid?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  message: string;
}

export class UserApiKeyService {
  // OpenRouter API Key Methods
  
  /**
   * Save user's OpenRouter API key
   */
  static async saveApiKey(apiKey: string): Promise<void> {
    return this.saveOpenRouterApiKey(apiKey);
  }

  /**
   * Save user's OpenRouter API key
   */
  static async saveOpenRouterApiKey(apiKey: string): Promise<void> {
    try {
      const response = await fetchWithAuth('/api/v1/user/openrouter-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save API key');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to save API key');
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      throw error;
    }
  }

  /**
   * Get user's API key status
   */
  static async getApiKeyStatus(): Promise<ApiKeyStatus> {
    try {
      const response = await fetchWithAuth('/api/v1/user/openrouter-key/status');
      
      if (!response.ok) {
        throw new Error('Failed to get API key status');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get API key status:', error);
      throw error;
    }
  }

  /**
   * Validate an API key
   */
  static async validateApiKey(apiKey?: string): Promise<ApiKeyValidationResult> {
    try {
      const response = await fetchWithAuth('/api/v1/user/openrouter-key/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          isValid: false,
          message: errorData.message || 'Failed to validate API key',
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to validate API key:', error);
      return {
        isValid: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete user's OpenRouter API key
   */
  static async deleteApiKey(): Promise<void> {
    return this.deleteOpenRouterApiKey();
  }

  /**
   * Delete user's OpenRouter API key
   */
  static async deleteOpenRouterApiKey(): Promise<void> {
    try {
      const response = await fetchWithAuth('/api/v1/user/openrouter-key', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete API key');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete API key');
      }
    } catch (error) {
      console.error('Failed to delete API key:', error);
      throw error;
    }
  }

  // OpenAI API Key Methods
  
  /**
   * Save user's OpenAI API key
   */
  static async saveOpenAIApiKey(apiKey: string): Promise<void> {
    try {
      const response = await fetchWithAuth('/api/v1/user/openai-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save OpenAI API key');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to save OpenAI API key');
      }
    } catch (error) {
      console.error('Failed to save OpenAI API key:', error);
      throw error;
    }
  }

  /**
   * Get user's OpenAI API key status
   */
  static async getOpenAIApiKeyStatus(): Promise<ApiKeyStatus> {
    try {
      const response = await fetchWithAuth('/api/v1/user/openai-key/status');
      
      if (!response.ok) {
        throw new Error('Failed to get OpenAI API key status');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get OpenAI API key status:', error);
      throw error;
    }
  }

  /**
   * Validate an OpenAI API key
   */
  static async validateOpenAIApiKey(apiKey?: string): Promise<ApiKeyValidationResult> {
    try {
      const response = await fetchWithAuth('/api/v1/user/openai-key/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          isValid: false,
          message: errorData.message || 'Failed to validate OpenAI API key',
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to validate OpenAI API key:', error);
      return {
        isValid: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete user's OpenAI API key
   */
  static async deleteOpenAIApiKey(): Promise<void> {
    try {
      const response = await fetchWithAuth('/api/v1/user/openai-key', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete OpenAI API key');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to delete OpenAI API key');
      }
    } catch (error) {
      console.error('Failed to delete OpenAI API key:', error);
      throw error;
    }
  }
} 