import { useState, useEffect } from 'react';
import { Attachment } from '../../types/chat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useIsMobile } from '../../hooks/use-mobile';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

interface ImageAttachmentProps {
  attachment: Attachment;
  onRemove?: () => void;
}

export function ImageAttachment({ attachment, onRemove }: ImageAttachmentProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    // Create blob URL from File object for preview
    if (attachment.file && attachment.fileType.startsWith('image/')) {
      const blobUrl = URL.createObjectURL(attachment.file);
      setImageSrc(blobUrl);
      
      return () => {
        URL.revokeObjectURL(blobUrl);
      };
    }
  }, [attachment.file, attachment.fileType]);

  const handleImageClick = () => {
    if (imageSrc) {
      setViewerOpen(true);
    }
  };

  if (!imageSrc) {
    return null;
  }

  return (
    <>
      <div className="relative group">
        <img
          src={imageSrc}
          alt={attachment.filename}
          className="w-16 h-16 object-cover rounded-lg cursor-pointer border border-border/50"
          onClick={handleImageClick}
        />
        
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "absolute -top-2 -right-2 h-5 w-5 p-0 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full transition-opacity",
              isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={onRemove}
          >
            <X className="h-3 w-3" />
          </Button>
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