import { Context, Next } from 'hono';

export const fileValidationMiddleware = (allowedTypes: string[], maxSize: number) => {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.parseBody();
      const file = body.file as File | undefined;
      
      if (!file) {
        return c.json({ error: 'No file provided' }, 400);
      }
      
      // Validate file type
      if (!allowedTypes.includes(file.type) && !allowedTypes.includes(file.type.split('/')[0] + '/*')) {
        return c.json({
          error: 'Invalid file type',
          message: `Allowed types: ${allowedTypes.join(', ')}`,
          received: file.type,
        }, 400);
      }
      
      // Validate file size
      if (file.size > maxSize) {
        return c.json({
          error: 'File too large',
          message: `Maximum size: ${maxSize} bytes`,
          received: file.size,
        }, 400);
      }
      
      // Add validated file to context
      c.set('validatedFile', file);
      
      await next();
    } catch (error) {
      console.error('File validation error:', error);
      return c.json({
        error: 'File validation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 400);
    }
  };
};

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/rtf',
  'application/rtf',
];

export const ALL_ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
];

// File size constants (in bytes)
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB 