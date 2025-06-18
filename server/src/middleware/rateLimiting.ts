import { Context, Next } from 'hono';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// Simple in-memory store for rate limiting
// In production, you'd want to use Redis or similar
const store: RateLimitStore = {};

export const rateLimitMiddleware = (requests: number, windowMs: number) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    const userId = user?.id || c.req.header('x-forwarded-for') || 'anonymous';
    
    const now = Date.now();
    const key = `${userId}:${Math.floor(now / windowMs)}`;
    
    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      const cutoff = now - windowMs * 2;
      Object.keys(store).forEach(k => {
        if (store[k].resetTime < cutoff) {
          delete store[k];
        }
      });
    }
    
    // Check current rate limit
    if (!store[key]) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }
    
    store[key].count++;
    
    // Set rate limit headers
    c.header('X-RateLimit-Limit', requests.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, requests - store[key].count).toString());
    c.header('X-RateLimit-Reset', Math.ceil(store[key].resetTime / 1000).toString());
    
    if (store[key].count > requests) {
      return c.json(
        {
          error: 'Rate limit exceeded',
          message: `Maximum ${requests} requests per ${windowMs / 1000} seconds`,
          retryAfter: Math.ceil((store[key].resetTime - now) / 1000),
        },
        429
      );
    }
    
    await next();
  };
}; 