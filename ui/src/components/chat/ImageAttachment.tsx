import { useState, useEffect } from 'react';
import { Attachment } from '../../types/chat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { getFile } from '../../lib/serverComm';

interface ImageAttachmentProps {
  attachment: Attachment;
  messageId: string;
}

export function ImageAttachment({ attachment, messageId: _messageId }: ImageAttachmentProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const setupImageSrc = async () => {
      // Priority 1: If we have the actual File object (for optimistic/pending uploads)
      if (attachment.file && attachment.fileType.startsWith('image/')) {
        const blobUrl = URL.createObjectURL(attachment.file);
        setImageSrc(blobUrl);
        return;
      }

      // Priority 2: If we have a previewUrl (existing blob URL)
      if (attachment.previewUrl) {
        setImageSrc(attachment.previewUrl);
        return;
      }

      // Priority 3: If we have a direct URL
      if (attachment.url) {
        setImageSrc(attachment.url);
        return;
      }

      // Priority 4: If we have a file ID, try to fetch from server
      // This handles cases where:
      // - File is marked as uploaded
      // - File has no status but has an ID (likely uploaded)
      // - File is from a loaded chat
      if (attachment.id && 
          !attachment.id.startsWith('temp-') && 
          !attachment.id.startsWith('stable-')) {
        
        const shouldTryFetch = 
          attachment.status === 'uploaded' || 
          !attachment.status || // No status likely means it's an old uploaded file
          attachment.status === 'pending'; // Sometimes pending files are actually uploaded
        
        if (shouldTryFetch) {
          console.log(`[IMAGE-ATTACHMENT] Attempting to fetch image ${attachment.id}`, {
            filename: attachment.filename,
            status: attachment.status,
            hasUrl: !!attachment.url
          });
          
          setIsLoading(true);
          setError(false);
          
          try {
            const blob = await getFile(attachment.id);
            const blobUrl = URL.createObjectURL(blob);
            setImageSrc(blobUrl);
            console.log(`[IMAGE-ATTACHMENT] Successfully fetched and created blob URL for ${attachment.id}`);
          } catch (err) {
            console.error(`[IMAGE-ATTACHMENT] Failed to fetch image ${attachment.id}:`, err);
            setError(true);
          } finally {
            setIsLoading(false);
          }
        }
      }
    };

    setupImageSrc();

    // Cleanup function
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:') && attachment.file) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [attachment.id, attachment.file, attachment.previewUrl, attachment.url, attachment.status]);

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, []);

  const handleImageClick = () => {
    if (imageSrc) {
      setViewerOpen(true);
    }
  };

  const handleImageError = () => {
    setError(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-[300px] max-h-[300px] bg-muted rounded-lg flex items-center justify-center border">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Error state or no image source
  if (error || !imageSrc) {
    // Determine if this is truly an uploading state vs a loading/error state
    const isTrulyUploading = attachment.status === 'uploading' || 
                           (attachment.status === 'pending' && attachment.file); // Only pending with file is truly uploading
    
    const isLikelyUploaded = attachment.id && 
                           !attachment.id.startsWith('temp-') && 
                           !attachment.id.startsWith('stable-') &&
                           !attachment.file; // No file object means it's from server
    
    return (
      <div className="max-w-[300px] max-h-[300px] bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
        <div className="text-center p-4">
          <div className="text-sm font-medium text-muted-foreground">
            {isTrulyUploading ? 'Uploading...' : 
             error ? 'Failed to load' : 
             isLikelyUploaded ? 'Loading image...' : 
             'Image not available'}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {attachment.filename}
          </div>
        </div>
      </div>
    );
  }

  // Success state
  const isTrulyUploading = attachment.file && 
                          (attachment.status === 'uploading' || attachment.status === 'pending');

  return (
    <>
      <div className="relative">
        <img
          src={imageSrc}
          alt={attachment.filename}
          className={`max-w-[300px] max-h-[300px] w-auto h-auto object-contain rounded-lg cursor-zoom-in transition-opacity duration-200 ${
            isTrulyUploading ? 'opacity-70' : 'opacity-100'
          }`}
          onClick={handleImageClick}
          onError={handleImageError}
        />
        
        {/* Upload progress indicator - only show for files with File object being uploaded */}
        {isTrulyUploading && (
          <div className="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center">
            <div className="bg-black/60 text-white text-xs px-2 py-1 rounded">
              Uploading...
            </div>
          </div>
        )}
      </div>

      {/* Image viewer dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{attachment.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <img
              src={imageSrc}
              alt={attachment.filename}
              className="max-w-full max-h-[70vh] object-contain rounded"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 