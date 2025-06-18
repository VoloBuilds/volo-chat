/**
 * Cross-platform environment variable utilities
 * Works with both Node.js (process.env) and Cloudflare Workers (c.env)
 */

type EnvLike = Record<string, string | undefined>;

let contextEnv: EnvLike | null = null;

export function setEnvContext(env: any) {
  contextEnv = env;
}

export function clearEnvContext() {
  contextEnv = null;
}

function getEnvSource(): EnvLike {
  const source = contextEnv || process.env;
  return source;
}

/**
 * Get environment variable with fallback support
 * Works in both Node.js and Cloudflare Workers environments
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  const source = getEnvSource();
  const value = source[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Get required environment variable, throws if missing
 */
export function getRequiredEnv(key: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Check if we're in development mode
 * Works across Node.js and Cloudflare Workers
 */
export function isDevelopment(): boolean {
  return getEnv('NODE_ENV') === 'development' || 
         getEnv('FIREBASE_AUTH_EMULATOR_HOST') !== undefined;
}

/**
 * Get database URL from environment
 */
export function getDatabaseUrl(): string | undefined {
  return getEnv('DATABASE_URL');
}

/**
 * Check if DATABASE_URL is configured
 */
export function isDatabaseConfigured(): boolean {
  return !!getDatabaseUrl();
}

/**
 * Get Firebase project ID from environment
 */
export function getFirebaseProjectId(): string {
  return getRequiredEnv('FIREBASE_PROJECT_ID');
}

/**
 * For Node.js environments - get process.env
 */
export function getNodeEnv() {
  return process.env;
}

/**
 * Get OpenAI API key from environment
 */
export function getOpenAIApiKey(): string | undefined {
  return getEnv('OPENAI_API_KEY');
}

/**
 * Type guard to check if we're in a Cloudflare Workers environment
 */
export function isCloudflareEnv(source: EnvLike): boolean {
  // In Cloudflare Workers, process.env is not available or is empty
  return typeof process === 'undefined' || Object.keys(process.env).length === 0;
} 