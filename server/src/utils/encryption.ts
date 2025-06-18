import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { getEnv } from '../lib/env';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const TAG_LENGTH = 16; // 128 bits

/**
 * Get or create the master encryption key from environment
 */
function getMasterKey(): Buffer {
  const envKey = getEnv('API_KEY_ENCRYPTION_SECRET');
  if (!envKey) {
    const isProduction = process.env.NODE_ENV === 'production';
    const errorMessage = isProduction 
      ? 'API key encryption is not properly configured. Please contact support.'
      : 'API_KEY_ENCRYPTION_SECRET environment variable is required for BYOK feature. Please check your .env file.';
    throw new Error(errorMessage);
  }
  
  // Ensure the key is 32 bytes (256 bits)
  return createHash('sha256').update(envKey).digest();
}

/**
 * Derive user-specific encryption key from master key and user ID
 */
function deriveUserKey(userId: string, salt: string): Buffer {
  const masterKey = getMasterKey();
  const userKeyMaterial = `${userId}:${salt}`;
  
  return createHash('sha256')
    .update(masterKey)
    .update(userKeyMaterial)
    .digest();
}

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString('hex');
}

/**
 * Encrypt an API key for a specific user
 */
export function encryptApiKey(apiKey: string, userId: string, salt: string): string {
  try {
    const userKey = deriveUserKey(userId, salt);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, userKey, iv);
    
    let encryptedData = cipher.update(apiKey, 'utf8', 'hex');
    encryptedData += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine IV, encrypted data, and auth tag
    const combined = Buffer.concat([iv, Buffer.from(encryptedData, 'hex'), tag]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('API key encryption failed:', error);
    throw new Error('Failed to encrypt API key');
  }
}

/**
 * Decrypt an API key for a specific user
 */
export function decryptApiKey(encryptedKey: string, userId: string, salt: string): string {
  try {
    const userKey = deriveUserKey(userId, salt);
    const combined = Buffer.from(encryptedKey, 'base64');
    
    // Extract IV, encrypted data, and auth tag
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const encryptedData = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
    
    const decipher = createDecipheriv(ALGORITHM, userKey, iv);
    decipher.setAuthTag(tag);
    
    let decryptedData = decipher.update(encryptedData, undefined, 'utf8');
    decryptedData += decipher.final('utf8');
    
    return decryptedData;
  } catch (error) {
    console.error('API key decryption failed:', error);
    throw new Error('Failed to decrypt API key');
  }
}

/**
 * Validate API key format (basic validation)
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  // OpenRouter API keys typically start with 'sk-' and have specific length requirements
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Remove whitespace
  const trimmedKey = apiKey.trim();
  
  // Check for OpenRouter format (starts with 'sk-or-' or 'sk-')
  if (!trimmedKey.startsWith('sk-')) {
    return false;
  }
  
  // Check minimum length (OpenRouter keys are typically 51+ characters)
  if (trimmedKey.length < 20) {
    return false;
  }
  
  // Check for valid characters (alphanumeric, hyphens, underscores)
  const validChars = /^[a-zA-Z0-9\-_]+$/.test(trimmedKey);
  if (!validChars) {
    return false;
  }
  
  return true;
}

/**
 * Securely clear sensitive data from memory (best effort)
 */
export function secureClear(data: string): void {
  // Note: This is a best-effort approach as JavaScript doesn't provide
  // guaranteed memory clearing, but it's better than nothing
  if (typeof data === 'string') {
    // Overwrite the string content (though this may not work in all JS engines)
    for (let i = 0; i < data.length; i++) {
      data = data.substring(0, i) + '0' + data.substring(i + 1);
    }
  }
} 