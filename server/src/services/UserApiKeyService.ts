import { eq } from 'drizzle-orm';
import { getDatabase } from '../lib/db-cloudflare';
import { users } from '../schema';
import { encryptApiKey, decryptApiKey, generateSalt, validateApiKeyFormat, secureClear } from '../utils/encryption';
import { OpenRouterProvider } from './ai/OpenRouterProvider';

// In-memory cache for decrypted API keys
// Key: userId, Value: { apiKey: string, timestamp: number }
const apiKeyCache = new Map<string, { apiKey: string; timestamp: number }>();

// Cache TTL from environment or default to 1 hour
const CACHE_TTL = parseInt(process.env.USER_KEY_CACHE_TTL || '3600') * 1000; // Convert to milliseconds

export class UserApiKeyService {
  /**
   * Save a user's OpenRouter API key (encrypted)
   */
  static async saveUserApiKey(userId: string, apiKey: string): Promise<void> {
    return this.saveOpenRouterApiKey(userId, apiKey);
  }

  /**
   * Save a user's OpenRouter API key (encrypted)
   */
  static async saveOpenRouterApiKey(userId: string, apiKey: string): Promise<void> {
    // Validate API key format first
    if (!validateApiKeyFormat(apiKey)) {
      throw new Error('Invalid API key format');
    }

    try {
      const db = await getDatabase();
      const salt = generateSalt();
      const encryptedKey = encryptApiKey(apiKey.trim(), userId, salt);
      const now = new Date();

      // Update user record with encrypted key
      await db
        .update(users)
        .set({
          encryptedOpenrouterKey: encryptedKey,
          openrouterKeySalt: salt,
          openrouterKeyCreatedAt: now.toISOString(),
          openrouterKeyUpdatedAt: now.toISOString(),
          updated_at: now,
        })
        .where(eq(users.id, userId));

      // Update cache
      this.setCachedApiKey(userId, apiKey.trim());

      // Securely clear the original key from memory
      secureClear(apiKey);

      console.log(`API key saved successfully for user: ${userId}`);
    } catch (error) {
      console.error('Failed to save user API key:', error);
      throw new Error('Failed to save API key');
    }
  }

  /**
   * Get a user's decrypted OpenRouter API key (with caching)
   */
  static async getUserApiKey(userId: string): Promise<string | null> {
    return this.getOpenRouterApiKey(userId);
  }

  /**
   * Get a user's decrypted OpenRouter API key (with caching)
   */
  static async getOpenRouterApiKey(userId: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.getCachedApiKey(userId);
      if (cached) {
        return cached;
      }

      // Fetch from database
      const db = await getDatabase();
      const [user] = await db
        .select({
          encryptedKey: users.encryptedOpenrouterKey,
          salt: users.openrouterKeySalt,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user || !user.encryptedKey || !user.salt) {
        return null;
      }

      // Decrypt the key
      const decryptedKey = decryptApiKey(user.encryptedKey, userId, user.salt);
      
      // Cache the decrypted key
      this.setCachedApiKey(userId, decryptedKey);

      return decryptedKey;
    } catch (error) {
      console.error('Failed to get user API key:', error);
      return null;
    }
  }

  /**
   * Delete a user's OpenRouter API key
   */
  static async deleteUserApiKey(userId: string): Promise<void> {
    return this.deleteOpenRouterApiKey(userId);
  }

  /**
   * Delete a user's OpenRouter API key
   */
  static async deleteOpenRouterApiKey(userId: string): Promise<void> {
    try {
      const db = await getDatabase();

      // Clear from database
      await db
        .update(users)
        .set({
          encryptedOpenrouterKey: null,
          openrouterKeySalt: null,
          openrouterKeyCreatedAt: null,
          openrouterKeyUpdatedAt: null,
          updated_at: new Date(),
        })
        .where(eq(users.id, userId));

      // Clear from cache
      this.clearCachedApiKey(userId);

      console.log(`API key deleted successfully for user: ${userId}`);
    } catch (error) {
      console.error('Failed to delete user API key:', error);
      throw new Error('Failed to delete API key');
    }
  }

  /**
   * Validate a user's API key by testing it with OpenRouter
   */
  static async validateUserApiKey(userId: string, apiKey?: string): Promise<boolean> {
    try {
      // Use provided key or fetch from storage
      const keyToValidate = apiKey || await this.getUserApiKey(userId);
      
      if (!keyToValidate) {
        return false;
      }

      // Test the key with OpenRouter API
      const provider = new OpenRouterProvider();
      const isValid = await provider.validateApiKey(keyToValidate);

      return isValid;
    } catch (error) {
      console.error('Failed to validate user API key:', error);
      return false;
    }
  }

  /**
   * Check if user has an API key stored
   */
  static async hasUserApiKey(userId: string): Promise<boolean> {
    try {
      // Check cache first
      if (this.getCachedApiKey(userId)) {
        return true;
      }

      // Check database
      const db = await getDatabase();
      const [user] = await db
        .select({
          hasKey: users.encryptedOpenrouterKey,
        })
        .from(users)
        .where(eq(users.id, userId));

      return !!(user?.hasKey);
    } catch (error) {
      console.error('Failed to check if user has API key:', error);
      return false;
    }
  }

  /**
   * Get API key status information for a user
   */
  static async getApiKeyStatus(userId: string): Promise<{
    hasKey: boolean;
    isValid?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }> {
    try {
      const db = await getDatabase();
      const [user] = await db
        .select({
          encryptedKey: users.encryptedOpenrouterKey,
          createdAt: users.openrouterKeyCreatedAt,
          updatedAt: users.openrouterKeyUpdatedAt,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user || !user.encryptedKey) {
        return { hasKey: false };
      }

      // Test if the key is valid
      const isValid = await this.validateUserApiKey(userId);

      return {
        hasKey: true,
        isValid,
        createdAt: user.createdAt || undefined,
        updatedAt: user.updatedAt || undefined,
      };
    } catch (error) {
      console.error('Failed to get API key status:', error);
      return { hasKey: false };
    }
  }

  // OpenAI API Key Methods

  /**
   * Save a user's OpenAI API key (encrypted)
   */
  static async saveOpenAIApiKey(userId: string, apiKey: string): Promise<void> {
    // Validate OpenAI API key format (sk-...)
    if (!apiKey.startsWith('sk-')) {
      throw new Error('Invalid OpenAI API key format (should start with sk-)');
    }

    try {
      const db = await getDatabase();
      const salt = generateSalt();
      const encryptedKey = encryptApiKey(apiKey.trim(), userId, salt);
      const now = new Date();

      // Update user record with encrypted key
      await db
        .update(users)
        .set({
          encryptedOpenaiKey: encryptedKey,
          openaiKeySalt: salt,
          openaiKeyCreatedAt: now.toISOString(),
          openaiKeyUpdatedAt: now.toISOString(),
          updated_at: now,
        })
        .where(eq(users.id, userId));

      // Update cache
      this.setCachedOpenAIApiKey(userId, apiKey.trim());

      // Securely clear the original key from memory
      secureClear(apiKey);

      console.log(`OpenAI API key saved successfully for user: ${userId}`);
    } catch (error) {
      console.error('Failed to save OpenAI API key:', error);
      throw new Error('Failed to save OpenAI API key');
    }
  }

  /**
   * Get a user's decrypted OpenAI API key (with caching)
   */
  static async getOpenAIApiKey(userId: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.getCachedOpenAIApiKey(userId);
      if (cached) {
        return cached;
      }

      // Fetch from database
      const db = await getDatabase();
      const [user] = await db
        .select({
          encryptedKey: users.encryptedOpenaiKey,
          salt: users.openaiKeySalt,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user || !user.encryptedKey || !user.salt) {
        return null;
      }

      // Decrypt the key
      const decryptedKey = decryptApiKey(user.encryptedKey, userId, user.salt);
      
      // Cache the decrypted key
      this.setCachedOpenAIApiKey(userId, decryptedKey);

      return decryptedKey;
    } catch (error) {
      console.error('Failed to get OpenAI API key:', error);
      return null;
    }
  }

  /**
   * Delete a user's OpenAI API key
   */
  static async deleteOpenAIApiKey(userId: string): Promise<void> {
    try {
      const db = await getDatabase();

      // Clear from database
      await db
        .update(users)
        .set({
          encryptedOpenaiKey: null,
          openaiKeySalt: null,
          openaiKeyCreatedAt: null,
          openaiKeyUpdatedAt: null,
          updated_at: new Date(),
        })
        .where(eq(users.id, userId));

      // Clear from cache
      this.clearCachedOpenAIApiKey(userId);

      console.log(`OpenAI API key deleted successfully for user: ${userId}`);
    } catch (error) {
      console.error('Failed to delete OpenAI API key:', error);
      throw new Error('Failed to delete OpenAI API key');
    }
  }

  /**
   * Validate a user's OpenAI API key by testing it with OpenAI API
   */
  static async validateOpenAIApiKey(userId: string, apiKey?: string): Promise<boolean> {
    try {
      // Use provided key or fetch from storage
      const keyToValidate = apiKey || await this.getOpenAIApiKey(userId);
      
      if (!keyToValidate) {
        return false;
      }

      // Test the key with OpenAI API
      const { OpenAIProvider } = await import('./ai/OpenAIProvider');
      const provider = new OpenAIProvider();
      const isValid = await provider.validateApiKey(keyToValidate);

      return isValid;
    } catch (error) {
      console.error('Failed to validate OpenAI API key:', error);
      return false;
    }
  }

  /**
   * Check if user has an OpenAI API key stored
   */
  static async hasOpenAIApiKey(userId: string): Promise<boolean> {
    try {
      // Check cache first
      if (this.getCachedOpenAIApiKey(userId)) {
        return true;
      }

      // Check database
      const db = await getDatabase();
      const [user] = await db
        .select({
          hasKey: users.encryptedOpenaiKey,
        })
        .from(users)
        .where(eq(users.id, userId));

      return !!(user?.hasKey);
    } catch (error) {
      console.error('Failed to check if user has OpenAI API key:', error);
      return false;
    }
  }

  /**
   * Get OpenAI API key status information for a user
   */
  static async getOpenAIApiKeyStatus(userId: string): Promise<{
    hasKey: boolean;
    isValid?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }> {
    try {
      const db = await getDatabase();
      const [user] = await db
        .select({
          encryptedKey: users.encryptedOpenaiKey,
          createdAt: users.openaiKeyCreatedAt,
          updatedAt: users.openaiKeyUpdatedAt,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user || !user.encryptedKey) {
        return { hasKey: false };
      }

      // Test if the key is valid
      const isValid = await this.validateOpenAIApiKey(userId);

      return {
        hasKey: true,
        isValid,
        createdAt: user.createdAt || undefined,
        updatedAt: user.updatedAt || undefined,
      };
    } catch (error) {
      console.error('Failed to get OpenAI API key status:', error);
      return { hasKey: false };
    }
  }

  /**
   * Clear expired cache entries
   */
  static clearExpiredCache(): void {
    const now = Date.now();
    for (const [userId, cached] of apiKeyCache.entries()) {
      if (now - cached.timestamp > CACHE_TTL) {
        this.clearCachedApiKey(userId);
      }
    }
  }

  /**
   * Clear all cached keys (for security/logout)
   */
  static clearAllCache(): void {
    apiKeyCache.clear();
  }

  /**
   * Get cached API key if valid and not expired
   */
  private static getCachedApiKey(userId: string): string | null {
    const cached = apiKeyCache.get(userId);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL) {
      this.clearCachedApiKey(userId);
      return null;
    }

    // Opportunistic cleanup - clean expired entries when accessing cache
    if (Math.random() < 0.1) { // 10% chance to trigger cleanup
      this.clearExpiredCache();
    }

    return cached.apiKey;
  }

  /**
   * Set cached API key with timestamp
   */
  private static setCachedApiKey(userId: string, apiKey: string): void {
    apiKeyCache.set(userId, {
      apiKey,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cached API key for user
   */
  private static clearCachedApiKey(userId: string): void {
    const cached = apiKeyCache.get(userId);
    if (cached) {
      // Try to securely clear the cached key
      secureClear(cached.apiKey);
      apiKeyCache.delete(userId);
    }
  }

  // OpenAI cache methods (separate cache for OpenAI keys)
  private static openaiApiKeyCache = new Map<string, { apiKey: string; timestamp: number }>();

  /**
   * Get cached OpenAI API key if valid and not expired
   */
  private static getCachedOpenAIApiKey(userId: string): string | null {
    const cached = this.openaiApiKeyCache.get(userId);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL) {
      this.clearCachedOpenAIApiKey(userId);
      return null;
    }

    return cached.apiKey;
  }

  /**
   * Set cached OpenAI API key with timestamp
   */
  private static setCachedOpenAIApiKey(userId: string, apiKey: string): void {
    this.openaiApiKeyCache.set(userId, {
      apiKey,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cached OpenAI API key for user
   */
  private static clearCachedOpenAIApiKey(userId: string): void {
    const cached = this.openaiApiKeyCache.get(userId);
    if (cached) {
      // Try to securely clear the cached key
      secureClear(cached.apiKey);
      this.openaiApiKeyCache.delete(userId);
    }
  }
} 