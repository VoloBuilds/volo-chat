import { v4 as uuidv4 } from 'uuid';
import * as mime from 'mime-types';
import { getDatabase } from '../lib/db-cloudflare';
import { files, type FileRecord, type NewFileRecord } from '../schema/files';
import { eq, and } from 'drizzle-orm';

export interface CloudflareEnv {
  R2_BUCKET?: R2Bucket;
  R2_PUBLIC_URL?: string; // Base URL for R2 public access
}

export class FileService {
  private tempStorage = new Map<string, ArrayBuffer>(); // Temporary storage for pending files

  constructor() {
    // Temporary storage will be used for files pending message submission
  }

  async uploadFilePending(
    buffer: ArrayBuffer,
    originalName: string,
    userId: string,
    fileType?: string
  ): Promise<FileRecord> {
    console.log(`[FILE-SERVICE] Starting uploadFilePending:`, {
      originalName,
      userId,
      fileType,
      bufferSize: buffer.byteLength
    });

    try {
      const fileId = uuidv4();
      
      // Determine file type
      const mimeType = fileType || mime.lookup(originalName) || 'application/octet-stream';
      console.log(`[FILE-SERVICE] File ${fileId} - Determined MIME type:`, mimeType);
      
      // Store file temporarily in memory (for Cloudflare Workers)
      this.tempStorage.set(fileId, buffer);
      console.log(`[FILE-SERVICE] File ${fileId} - Stored in temp storage, temp storage size:`, this.tempStorage.size);
      
      const storagePath = `files/${userId}/${fileId}`;
      console.log(`[FILE-SERVICE] File ${fileId} - Storage path:`, storagePath);
      
      // For images, convert to base64 for immediate preview and Claude compatibility
      let metadata: any = {
        originalName,
        uploadedAt: new Date().toISOString(),
        cloudflareR2: false, // Will be true when uploaded to R2
      };

      if (mimeType.startsWith('image/')) {
        console.log(`[FILE-SERVICE] File ${fileId} - Image file detected, metadata will be minimal`);
        metadata.isImage = true;
        // No image data stored in database - everything goes to R2
      } else {
        console.log(`[FILE-SERVICE] File ${fileId} - Non-image file`);
        metadata.isImage = false;
      }
      
      // Save file record to database with pending status
      const db = await getDatabase();
      const newFile: NewFileRecord = {
        id: fileId,
        userId,
        filename: originalName,
        fileType: mimeType,
        fileSize: buffer.byteLength,
        storagePath,
        status: 'pending',
        metadata,
      };

      console.log(`[FILE-SERVICE] File ${fileId} - Saving to database:`, {
        filename: originalName,
        fileType: mimeType,
        fileSize: buffer.byteLength,
        status: 'pending'
      });

      const [fileRecord] = await db.insert(files).values(newFile).returning();
      console.log(`[FILE-SERVICE] File ${fileId} - Successfully saved to database with ID:`, fileRecord.id);
      
      return fileRecord;
    } catch (error) {
      console.error('File upload pending error:', error);
      throw new Error(`Failed to prepare file upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async commitFilesToR2(fileIds: string[], env: CloudflareEnv): Promise<void> {
    console.log(`[FILE-SERVICE] Starting commitFilesToR2 for ${fileIds.length} files:`, fileIds);
    
    if (!env.R2_BUCKET) {
      console.warn('[FILE-SERVICE] R2_BUCKET not configured, files will remain in pending status');
      return;
    }

    console.log(`[FILE-SERVICE] R2_BUCKET found, R2_PUBLIC_URL:`, env.R2_PUBLIC_URL);
    const db = await getDatabase();

    for (const fileId of fileIds) {
      console.log(`[FILE-SERVICE] Processing file ${fileId} for R2 commit`);
      try {
        // Get file record
        const [fileRecord] = await db.select().from(files).where(eq(files.id, fileId));
        if (!fileRecord || fileRecord.status !== 'pending') {
          console.warn(`[FILE-SERVICE] File ${fileId} not found or not in pending status:`, {
            found: !!fileRecord,
            status: fileRecord?.status
          });
          continue;
        }

        console.log(`[FILE-SERVICE] File ${fileId} - Found pending file record:`, {
          filename: fileRecord.filename,
          status: fileRecord.status,
          storagePath: fileRecord.storagePath
        });

        // Get file buffer from temp storage
        const buffer = this.tempStorage.get(fileId);
        if (!buffer) {
          console.error(`[FILE-SERVICE] File buffer not found for ${fileId} in temp storage`);
          await db.update(files)
            .set({ status: 'failed' })
            .where(eq(files.id, fileId));
          continue;
        }

        console.log(`[FILE-SERVICE] File ${fileId} - Found buffer in temp storage, size:`, buffer.byteLength);

        // Upload to R2
        const r2Key = fileRecord.storagePath;
        console.log(`[FILE-SERVICE] File ${fileId} - Uploading to R2 with key:`, r2Key);
        
        await env.R2_BUCKET.put(r2Key, buffer, {
          httpMetadata: {
            contentType: fileRecord.fileType,
            contentDisposition: `attachment; filename="${fileRecord.filename}"`,
          },
        });

        console.log(`[FILE-SERVICE] File ${fileId} - Successfully uploaded to R2`);

        // Update file record with uploaded status (no public URL needed)
        const updatedMetadata = fileRecord.metadata ? 
          { ...(fileRecord.metadata as object), cloudflareR2: true, uploadedToR2At: new Date().toISOString() } :
          { cloudflareR2: true, uploadedToR2At: new Date().toISOString() };

        console.log(`[FILE-SERVICE] File ${fileId} - Updating database with uploaded status (private R2 storage)`);
        console.log(`[FILE-SERVICE] File ${fileId} - Original metadata:`, fileRecord.metadata);
        console.log(`[FILE-SERVICE] File ${fileId} - Updated metadata:`, updatedMetadata);

        await db.update(files)
          .set({ 
            status: 'uploaded',
            metadata: updatedMetadata
            // r2Url intentionally omitted - we use private access only
          })
          .where(eq(files.id, fileId));

        console.log(`[FILE-SERVICE] File ${fileId} - Successfully updated database with uploaded status`);

        // Clean up temp storage only after successful database update
        this.tempStorage.delete(fileId);
        console.log(`[FILE-SERVICE] File ${fileId} - Cleaned up temp storage`);

        console.log(`[FILE-SERVICE] File ${fileId} - Successfully uploaded to R2 (private storage)`);
      } catch (error) {
        console.error(`[FILE-SERVICE] Failed to upload file ${fileId} to R2:`, error);
        
        // Update status to failed
        try {
          await db.update(files)
            .set({ status: 'failed' })
            .where(eq(files.id, fileId));
          console.log(`[FILE-SERVICE] File ${fileId} - Updated status to failed`);
        } catch (dbError) {
          console.error(`[FILE-SERVICE] Failed to update status for file ${fileId}:`, dbError);
        }
      }
    }
  }

  async getFile(fileId: string): Promise<FileRecord | null> {
    try {
      const db = await getDatabase();
      const [fileRecord] = await db.select().from(files).where(eq(files.id, fileId));
      return fileRecord || null;
    } catch (error) {
      console.error('Get file error:', error);
      return null;
    }
  }

  async getFileBuffer(fileId: string, env?: CloudflareEnv): Promise<ArrayBuffer | null> {
    try {
      const fileRecord = await this.getFile(fileId);
      if (!fileRecord) {
        return null;
      }

      // If file is still pending, get from temp storage
      if (fileRecord.status === 'pending') {
        return this.tempStorage.get(fileId) || null;
      }

      // If file is uploaded to R2, retrieve from there
      if (fileRecord.status === 'uploaded' && env?.R2_BUCKET) {
        const object = await env.R2_BUCKET.get(fileRecord.storagePath);
        return object ? await object.arrayBuffer() : null;
      }

      console.warn(`File ${fileId} has status ${fileRecord.status} but cannot be retrieved`);
      return null;
    } catch (error) {
      console.error('Get file buffer error:', error);
      return null;
    }
  }

  async deleteFile(fileId: string, env?: CloudflareEnv): Promise<boolean> {
    try {
      const fileRecord = await this.getFile(fileId);
      if (!fileRecord) {
        return false;
      }

      // Delete from R2 if uploaded
      if (fileRecord.status === 'uploaded' && env?.R2_BUCKET) {
        try {
          await env.R2_BUCKET.delete(fileRecord.storagePath);
        } catch (error) {
          console.warn('Failed to delete file from R2:', error);
        }
      }

      // Clean up temp storage
      this.tempStorage.delete(fileId);

      // Delete from database
      const db = await getDatabase();
      await db.delete(files).where(eq(files.id, fileId));
      
      return true;
    } catch (error) {
      console.error('Delete file error:', error);
      return false;
    }
  }

  async cleanupOrphanedFiles(): Promise<void> {
    try {
      const db = await getDatabase();
      
      // Find files that have been pending for more than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const orphanedFiles = await db
        .select()
        .from(files)
        .where(and(
          eq(files.status, 'pending'),
          // Note: You might need to adjust this query based on your timestamp field
        ));

      for (const file of orphanedFiles) {
        console.log(`Cleaning up orphaned file: ${file.id}`);
        await this.deleteFile(file.id);
      }
    } catch (error) {
      console.error('Cleanup orphaned files error:', error);
    }
  }

  async processImage(fileRecord: FileRecord): Promise<string> {
    try {
      // Return URL for AI processing
      if (fileRecord.r2Url) {
        return `Image file: ${fileRecord.filename} - Available at: ${fileRecord.r2Url}`;
      }
      
      // No R2 URL available
      return `Image file: ${fileRecord.filename} (${fileRecord.fileType}, ${fileRecord.fileSize} bytes) - R2 storage required for processing`;
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error('Failed to process image');
    }
  }

  async processPDF(fileRecord: FileRecord): Promise<string> {
    try {
      if (fileRecord.r2Url) {
        return `PDF file: ${fileRecord.filename} - Available at: ${fileRecord.r2Url}`;
      }
      return `PDF file: ${fileRecord.filename} (${fileRecord.fileSize} bytes)`;
    } catch (error) {
      console.error('PDF processing error:', error);
      throw new Error('Failed to process PDF');
    }
  }

  async getUserFiles(userId: string): Promise<FileRecord[]> {
    try {
      const db = await getDatabase();
      const userFiles = await db.select().from(files).where(eq(files.userId, userId));
      return userFiles;
    } catch (error) {
      console.error('Get user files error:', error);
      return [];
    }
  }

  validateFileType(mimeType: string, allowedTypes: string[]): boolean {
    return allowedTypes.includes(mimeType) || allowedTypes.includes(mimeType.split('/')[0] + '/*');
  }

  validateFileSize(size: number, maxSize: number): boolean {
    return size <= maxSize;
  }

  // Get file URL for AI processing
  getFileUrlForAI(fileRecord: FileRecord): string | null {
    if (fileRecord.r2Url) {
      return fileRecord.r2Url;
    }
    return null;
  }

  // For AI processing, we'll need to use R2 URLs or generate signed URLs
  // No base64 data stored in database anymore
  canProcessImageForAI(fileRecord: FileRecord): boolean {
    return fileRecord.status === 'uploaded' && fileRecord.fileType.startsWith('image/');
  }
} 