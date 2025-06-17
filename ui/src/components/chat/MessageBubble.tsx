import { useState, useEffect } from 'react';
import { Message } from '../../types/chat';
import { Button } from '../ui/button';
import { Markdown } from '../ui/markdown';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { Copy, Check } from 'lucide-react';
import { Attachment } from '../../types/chat';
import { getFile } from '../../lib/serverComm';
import { FileAttachment } from './FileAttachment';

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
}

export function MessageBubble({ message, isLast }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const renderImageAttachments = () => {
    if (!message.attachments || message.attachments.length === 0) return null;
    
    const imageAttachments = message.attachments.filter(att => att.fileType.startsWith('image/'));
    if (imageAttachments.length === 0) return null;

    return (
      <div className="mb-3 space-y-2">
        {imageAttachments.map((attachment, index) => (
          <MessageImageAttachment key={attachment.id || index} attachment={attachment} messageId={message.id} />
        ))}
      </div>
    );
  };

  const renderNonImageAttachments = () => {
    if (!message.attachments || message.attachments.length === 0) return null;
    
    const nonImageAttachments = message.attachments.filter(att => !att.fileType.startsWith('image/'));
    if (nonImageAttachments.length === 0) return null;

    return (
      <div className="mt-3 space-y-2">
        {nonImageAttachments.map((attachment, index) => (
          <FileAttachment
            key={attachment.id || index}
            attachment={attachment}
            variant="compact"
          />
        ))}
      </div>
    );
  };

  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end w-full">
        {/* Images above the bubble */}
        {renderImageAttachments()}
        
        <div className="group relative max-w-[80%]">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 shadow-sm">
            <div className="break-words">
              <p className="whitespace-pre-wrap break-words m-0 text-base">{message.content}</p>
            </div>
            {renderNonImageAttachments()}
          </div>
          
          {/* Copy button - bottom right */}
          {!message.isStreaming && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute -bottom-8 right-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur hover:bg-background text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="flex flex-col items-start w-full">
      {/* Images above the content */}
      {renderImageAttachments()}
      
      <div className="group relative w-full">
        <div>
          {/* Model indicator */}
          {message.modelId && (
            <div className="text-xs text-muted-foreground mb-2">
              {message.modelId.replace(/^(claude-|gpt-|gemini-)/, '').toUpperCase()}
            </div>
          )}

          {/* Content with streaming animation */}
          <div className={cn(
            "prose prose-neutral dark:prose-invert max-w-none",
            "prose-p:leading-relaxed prose-pre:max-w-full prose-pre:overflow-x-auto",
            "prose-code:break-words prose-headings:break-words",
            "prose-code:text-sm prose-pre:text-sm",
            message.isStreaming && "animate-fade-in"
          )}>
            {message.content ? (
              <Markdown content={message.content} />
            ) : message.isStreaming ? (
              // Show floating dots for streaming messages without content
              <div className="flex space-x-1 py-2">
                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"></div>
              </div>
            ) : (
              <div className="text-muted-foreground italic">
                No content
              </div>
            )}
          </div>

          {renderNonImageAttachments()}
        </div>

        {/* Copy button - bottom left */}
        {!message.isStreaming && message.content && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute -bottom-8 left-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur hover:bg-background text-xs"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// Component for displaying images in messages (larger size)
function MessageImageAttachment({ attachment, messageId: _messageId }: { attachment: Attachment; messageId: string }) {
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
      if (attachment.id && 
          !attachment.id.startsWith('temp-') && 
          !attachment.id.startsWith('stable-')) {
        
        const shouldTryFetch = 
          attachment.status === 'uploaded' || 
          !attachment.status || // No status likely means it's an old uploaded file
          attachment.status === 'pending'; // Sometimes pending files are actually uploaded
        
        if (shouldTryFetch) {
          setIsLoading(true);
          setError(false);
          
          try {
            const blob = await getFile(attachment.id);
            const blobUrl = URL.createObjectURL(blob);
            setImageSrc(blobUrl);
          } catch (err) {
            console.error(`Failed to fetch image ${attachment.id}:`, err);
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
    const isTrulyUploading = attachment.status === 'uploading' || 
                           (attachment.status === 'pending' && attachment.file);
    
    const isLikelyUploaded = attachment.id && 
                           !attachment.id.startsWith('temp-') && 
                           !attachment.id.startsWith('stable-') &&
                           !attachment.file;
    
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
  return (
    <>
      <div className="relative">
        <img
          src={imageSrc}
          alt={attachment.filename}
          className="max-w-[300px] max-h-[300px] w-auto h-auto object-contain rounded-lg cursor-zoom-in"
          onClick={handleImageClick}
          onError={handleImageError}
        />
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