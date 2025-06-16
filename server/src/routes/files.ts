import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { FileService, type CloudflareEnv } from '../services/FileService';
import { getDatabase } from '../lib/db-cloudflare';
import { files } from '../schema';
import { 
  fileValidationMiddleware, 
  ALL_ALLOWED_TYPES, 
  MAX_FILE_SIZE 
} from '../middleware/fileValidation';
import { rateLimitMiddleware } from '../middleware/rateLimiting';

const fileRoutes = new Hono();
const fileService = new FileService();

// POST /api/files/upload - Upload file
fileRoutes.post(
  '/upload',
  rateLimitMiddleware(10, 60000), // 10 uploads per minute
  fileValidationMiddleware(ALL_ALLOWED_TYPES, MAX_FILE_SIZE),
  async (c) => {
    try {
      const user = c.get('user');
      if (!user) {
        console.log('[FILE-UPLOAD] Unauthorized access attempt');
        return c.json({ error: 'Unauthorized' }, 401);
      }

      console.log(`[FILE-UPLOAD] User ${user.id} uploading file`);

      const file = c.get('validatedFile' as any) as File;
      console.log(`[FILE-UPLOAD] File details:`, {
        name: file.name,
        type: file.type,
        size: file.size
      });
      
      // Convert File to ArrayBuffer (Cloudflare Workers compatible)
      const arrayBuffer = await file.arrayBuffer();
      console.log(`[FILE-UPLOAD] Converted to ArrayBuffer, size:`, arrayBuffer.byteLength);

      // Upload file to pending state (temp storage)
      const fileRecord = await fileService.uploadFilePending(
        arrayBuffer,
        file.name,
        user.id,
        file.type
      );

      console.log(`[FILE-UPLOAD] Successfully created file record:`, {
        id: fileRecord.id,
        filename: fileRecord.filename,
        status: fileRecord.status
      });

      return c.json({ 
        file: fileRecord,
        message: 'File uploaded successfully' 
      }, 201);

    } catch (error) {
      console.error('File upload error:', error);
      return c.json({
        error: 'File upload failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  }
);

// GET /api/files/:id - Download/get file
fileRoutes.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const fileId = c.req.param('id');
    const db = await getDatabase();

    // Get file record and verify ownership
    const [fileRecord] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.userId, user.id)
        )
      );

    if (!fileRecord) {
      return c.json({ error: 'File not found' }, 404);
    }

    // Get file buffer
    const fileBuffer = await fileService.getFileBuffer(fileId, c.env as CloudflareEnv);
    if (!fileBuffer) {
      return c.json({ error: 'File data not found or R2 integration not implemented' }, 404);
    }

    // Set appropriate headers
    c.header('Content-Type', fileRecord.fileType);
    c.header('Content-Length', fileRecord.fileSize.toString());
    c.header('Content-Disposition', `attachment; filename="${fileRecord.filename}"`);

    return c.body(fileBuffer);

  } catch (error) {
    console.error('File download error:', error);
    return c.json({
      error: 'File download failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/files/:id/info - Get file info without downloading
fileRoutes.get('/:id/info', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const fileId = c.req.param('id');
    const db = await getDatabase();

    // Get file record and verify ownership
    const [fileRecord] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.userId, user.id)
        )
      );

    if (!fileRecord) {
      return c.json({ error: 'File not found' }, 404);
    }

    return c.json({ file: fileRecord });

  } catch (error) {
    console.error('File info error:', error);
    return c.json({
      error: 'Failed to get file info',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/files - List user files
fileRoutes.get('/', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userFiles = await fileService.getUserFiles(user.id);
    return c.json({ files: userFiles });

  } catch (error) {
    console.error('List files error:', error);
    return c.json({
      error: 'Failed to list files',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/files/commit - Commit multiple files to R2
fileRoutes.post('/commit', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      console.log('[FILE-COMMIT] Unauthorized access attempt');
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { fileIds } = body;

    console.log(`[FILE-COMMIT] User ${user.id} committing files:`, fileIds);

    if (!fileIds || !Array.isArray(fileIds)) {
      console.log('[FILE-COMMIT] Invalid fileIds provided:', fileIds);
      return c.json({ error: 'fileIds array is required' }, 400);
    }

    // Verify all files belong to the user
    const db = await getDatabase();
    const userFiles = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.userId, user.id),
          // Check if file IDs are in the provided list
        )
      );

    const validFileIds = userFiles
      .filter(file => fileIds.includes(file.id) && file.status === 'pending')
      .map(file => file.id);

    if (validFileIds.length === 0) {
      return c.json({ error: 'No valid pending files found' }, 400);
    }

    // Commit files to R2
    await fileService.commitFilesToR2(validFileIds, c.env as CloudflareEnv);

    return c.json({ 
      success: true, 
      committedFiles: validFileIds.length,
      message: `${validFileIds.length} files committed to R2` 
    });

  } catch (error) {
    console.error('File commit error:', error);
    return c.json({
      error: 'File commit failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// DELETE /api/files/:id - Delete file
fileRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const fileId = c.req.param('id');
    const db = await getDatabase();

    // Verify ownership before deletion
    const [fileRecord] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.userId, user.id)
        )
      );

    if (!fileRecord) {
      return c.json({ error: 'File not found' }, 404);
    }

    // Delete file
    const deleted = await fileService.deleteFile(fileId, c.env as CloudflareEnv);
    
    if (!deleted) {
      return c.json({ error: 'Failed to delete file' }, 500);
    }

    return c.json({ success: true, message: 'File deleted successfully' });

  } catch (error) {
    console.error('File deletion error:', error);
    return c.json({
      error: 'File deletion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/files/:id/process - Process file (extract text, analyze image, etc.)
fileRoutes.post('/:id/process', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const fileId = c.req.param('id');
    const fileRecord = await fileService.getFile(fileId);

    if (!fileRecord || fileRecord.userId !== user.id) {
      return c.json({ error: 'File not found' }, 404);
    }

    let processedContent: string;

    if (fileRecord.fileType.startsWith('image/')) {
      processedContent = await fileService.processImage(fileRecord);
    } else if (fileRecord.fileType === 'application/pdf') {
      processedContent = await fileService.processPDF(fileRecord);
    } else {
      return c.json({ 
        error: 'File type not supported for processing',
        supportedTypes: ['image/*', 'application/pdf']
      }, 400);
    }

    return c.json({ 
      file: fileRecord,
      processedContent,
      message: 'File processed successfully' 
    });

  } catch (error) {
    console.error('File processing error:', error);
    return c.json({
      error: 'File processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// GET /api/files/debug/:id - Debug file information
fileRoutes.get('/debug/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const fileId = c.req.param('id');
    const db = await getDatabase();

    // Get file record and verify ownership
    const [fileRecord] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.userId, user.id)
        )
      );

    if (!fileRecord) {
      return c.json({ error: 'File not found' }, 404);
    }

    // Get additional info from FileService
    const r2Url = fileService.getFileUrlForAI(fileRecord);

    return c.json({ 
      file: fileRecord,
      debug: {
        hasR2Url: !!r2Url,
        r2Url: r2Url,
        status: fileRecord.status,
        storagePath: fileRecord.storagePath,
        isImage: fileRecord.fileType.startsWith('image/'),
        canProcessForAI: fileService.canProcessImageForAI(fileRecord)
      }
    });

  } catch (error) {
    console.error('File debug error:', error);
    return c.json({
      error: 'Failed to get file debug info',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

// POST /api/files/cleanup - Clean up orphaned files (admin or cron job)
fileRoutes.post('/cleanup', async (c) => {
  try {
    // This endpoint could be protected with admin auth or used by cron jobs
    await fileService.cleanupOrphanedFiles();
    
    return c.json({ 
      success: true, 
      message: 'Orphaned files cleanup completed' 
    });

  } catch (error) {
    console.error('File cleanup error:', error);
    return c.json({
      error: 'File cleanup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});



export { fileRoutes }; 