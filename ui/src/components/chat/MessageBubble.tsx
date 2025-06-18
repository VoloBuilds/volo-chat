import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Message } from '../../types/chat';
import { Button } from '../ui/button';
import { Markdown } from '../ui/markdown';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/use-mobile';
import { Copy, Check, GitBranch, RotateCcw } from 'lucide-react';
import { Attachment } from '../../types/chat';
import { getFile, getSharedChatFile, api } from '../../lib/serverComm';
import { FileAttachment } from './FileAttachment';

// Streaming Markdown component with magical smooth reveals
function StreamingMarkdown({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [prevLength, setPrevLength] = useState(0);
  const [isContentGrowing, setIsContentGrowing] = useState(false);
  const lastAnimationRef = useRef(0);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = useIsMobile();
  
  // Check if this is an error message - simplified approach
  const isErrorMessage = content && (
    content.toLowerCase().includes('error') ||
    content.includes('403') ||
    content.includes('401') ||
    content.includes('429')
  );

  // Check if this content contains generated image data (fallback for when file saving fails)
  const imageMatch = content?.match(/\[IMAGE_DATA:(data:image\/[^;]+;base64,[^\]]+)\](.*)$/s);
  const hasGeneratedImage = !!imageMatch;
  const imageDataUrl = imageMatch?.[1];
  const textContent = imageMatch?.[2] || content;

  // Check if this is an image generation progress message
  const isImageGenProgress = content?.includes('🎨') && (
    content.includes('Starting image generation') || 
    content.includes('Generating image...')
  );
  
  useEffect(() => {
    const currentLength = content?.length || 0;
    const now = Date.now();
    
    if (isStreaming && currentLength > prevLength) {
      // Throttle animations - only trigger if enough time has passed or significant content added
      const timeSinceLastAnimation = now - lastAnimationRef.current;
      const contentDiff = currentLength - prevLength;
      
      // Only animate if 200ms passed OR significant content added (50+ chars)
      if (timeSinceLastAnimation > 200 || contentDiff > 50) {
        setIsContentGrowing(true);
        lastAnimationRef.current = now;
        
        // Clear any existing timeout
        if (animationTimeoutRef.current) {
          clearTimeout(animationTimeoutRef.current);
        }
        
        // Reset the growing state after longer duration for gradual effect
        animationTimeoutRef.current = setTimeout(() => {
          setIsContentGrowing(false);
        }, 1200); // Much longer for gradual effect
      }
      
      setPrevLength(currentLength);
    } else if (!isStreaming) {
      // Streaming finished
      setPrevLength(currentLength);
      setIsContentGrowing(false);
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
    }
    
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [content, isStreaming, prevLength]);

  // If this is image generation progress, show loading state
  if (isImageGenProgress && isStreaming) {
    return (
      <div className={cn(
        "w-full max-w-full",
        "transition-all duration-700 ease-out",
        "streaming-container"
      )}>
        <div className="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
          {/* Spinning loader */}
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
          
          {/* Progress text */}
          <div className="flex-1">
            <div className="text-blue-700 dark:text-blue-300 font-medium">
              {content?.replace('🎨 ', '') || 'Generating image...'}
            </div>
            <div className="text-blue-600 dark:text-blue-400 text-sm mt-1">
              Using OpenAI gpt-image-1 • This may take a few moments
            </div>
          </div>
          
          {/* Art icon */}
          <div className="text-blue-500 text-xl">🎨</div>
        </div>
      </div>
    );
  }

  // If this is a generated image (fallback when file saving fails), render it specially
  if (hasGeneratedImage && imageDataUrl) {
    return (
      <div className={cn(
        "w-full max-w-full",
        "transition-all duration-700 ease-out",
        isStreaming && "streaming-container",
        isContentGrowing && "content-growing"
      )}>
        <div className={cn(
          "streaming-content-wrapper min-w-0 max-w-full space-y-3",
          isContentGrowing && "animate-bottom-reveal"
        )}>
          {/* Generated Image (fallback display) */}
          <div className="generated-image">
            <img 
              src={imageDataUrl} 
              alt="Generated image" 
              className="max-w-full h-auto rounded-lg shadow-lg"
              style={{ maxHeight: '500px', objectFit: 'contain' }}
            />
          </div>
          
          {/* Message text */}
          {textContent && (
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <Markdown content={textContent} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "prose prose-neutral dark:prose-invert max-w-none min-w-0",
      "prose-p:leading-relaxed prose-pre:max-w-full prose-pre:overflow-x-auto",
      "prose-code:break-words prose-headings:break-words",
      "prose-code:text-sm prose-pre:text-sm",
      // Responsive adjustments for mobile
      isMobile && "prose-sm prose-code:text-xs prose-pre:text-xs",
      // Better overflow handling
      "prose-pre:whitespace-pre-wrap prose-code:whitespace-pre-wrap",
      "break-words overflow-wrap-anywhere",
      // Strict width constraints to prevent expansion
      "w-full max-w-full",
      "transition-all duration-700 ease-out", // Longer base transition
      isStreaming && "streaming-container",
      isContentGrowing && "content-growing"
    )}>
      {content ? (
        <div className={cn(
          "streaming-content-wrapper min-w-0 max-w-full",
          isContentGrowing && "animate-bottom-reveal",
          // Special styling for error messages
          isErrorMessage && "border-l-4 border-red-500 pl-4 bg-red-50 dark:bg-red-950/20 rounded-r-md py-2 -ml-4"
        )}>
          <Markdown content={textContent} />
        </div>
      ) : isStreaming ? (
        // Show floating dots for streaming messages without content
        <div className="flex space-x-1 py-2 animate-pulse">
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
  );
}

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  canBranch?: boolean;
  onBranch?: (newChatId: string) => void;
  isFirst?: boolean;
  sharedChatId?: string; // For shared chat context
  canRetry?: boolean; // Whether retry is allowed
  onRetry?: (messageId: string) => void; // Retry callback
}

export function MessageBubble({ message, isLast, canBranch = true, onBranch, isFirst = false, sharedChatId, canRetry = false, onRetry }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [branching, setBranching] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  // Don't allow branching from temporary messages (streaming/optimistic updates)
  const canActuallyBranch = canBranch && !message.id.startsWith('temp-') && !message.isStreaming;
  
  // Don't allow retry from temporary messages or if currently streaming or if in shared context
  const canActuallyRetry = canRetry && !message.id.startsWith('temp-') && !message.isStreaming && !sharedChatId;

  // Check if this is an image generation progress message
  const isImageGenProgress = message.content?.includes('🎨') && (
    message.content.includes('Starting image generation') || 
    message.content.includes('Generating image...')
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const handleBranch = async () => {
    if (branching) return;
    
    setBranching(true);
    try {
      const result = await api.branchChatFromMessage(message.chatId, message.id);
      
      // Update the chat store directly to ensure the sidebar refreshes
      const { useChatStore } = await import('../../stores/chatStore');
      const { loadChats } = useChatStore.getState();
      await loadChats(true); // Force refresh the chat list
      
      toast.success('Chat branched successfully');
      onBranch?.(result.chat.id);
    } catch (error) {
      console.error('Failed to branch chat:', error);
      toast.error('Failed to branch chat. Please try again.');
    } finally {
      setBranching(false);
    }
  };

  const handleRetry = async () => {
    if (retrying || !onRetry) return;
    
    setRetrying(true);
    try {
      await onRetry(message.id);
    } catch (error) {
      console.error('Failed to retry message:', error);
      toast.error('Failed to retry message. Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  const renderImageAttachments = () => {
    if (!message.attachments || message.attachments.length === 0) return null;
    
    const imageAttachments = message.attachments.filter(att => att.fileType.startsWith('image/'));
    if (imageAttachments.length === 0) return null;

    return (
      <div className="mb-3 space-y-2">
        {imageAttachments.map((attachment, index) => (
          <MessageImageAttachment 
            key={attachment.id || index} 
            attachment={attachment} 
            messageId={message.id}
            sharedChatId={sharedChatId}
          />
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
      <div className={cn(
        "flex flex-col items-end w-full",
        isFirst && "animate-fade-in"
      )}>
        {/* Images above the bubble */}
        {renderImageAttachments()}
        
        <div className={cn(
          "group relative",
          isMobile ? "max-w-[90%]" : "max-w-[80%]"
        )}>
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 shadow-sm">
            <div className="break-words overflow-hidden">
              <p className="whitespace-pre-wrap break-words m-0 text-base">{message.content}</p>
            </div>
            {renderNonImageAttachments()}
          </div>
          
          {/* Action buttons - bottom right */}
          {!message.isStreaming && (
            <div className="absolute -bottom-8 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {canActuallyBranch && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 bg-background/80 backdrop-blur hover:bg-background text-xs"
                  onClick={handleBranch}
                  disabled={branching}
                >
                  <GitBranch className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 bg-background/80 backdrop-blur hover:bg-background text-xs"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className={cn(
      "flex flex-col items-start w-full",
      isFirst && "animate-fade-in",
      message.isStreaming && !isFirst && "animate-stream-in"
    )}>
      {/* Images above the content */}
      {renderImageAttachments()}
      
      <div className={cn(
        "group relative w-full min-w-0",
        // Add explicit max width constraints for different screen sizes
        isMobile 
          ? "max-w-[calc(100vw-1.5rem)]" // Mobile: account for padding
          : "max-w-[min(100%,calc(100vw-20rem))]" // Desktop: account for potential sidebar
      )}>
        <div className="min-w-0 w-full max-w-full">
          {/* Model indicator */}
          {message.modelId && (
            <div className="text-xs text-muted-foreground mb-2">
              {message.modelId.replace(/^(claude-|gpt-|gemini-)/, '').toUpperCase()}
            </div>
          )}

          {/* Content with streaming animation */}
          <div className="min-w-0 w-full max-w-full overflow-hidden">
            <StreamingMarkdown content={message.content || ''} isStreaming={!!message.isStreaming} />
          </div>

          {renderNonImageAttachments()}
        </div>

        {/* Action buttons - bottom left (hidden for image generation progress) */}
        {!message.isStreaming && message.content && !isImageGenProgress && (
          <div className="absolute -bottom-8 left-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 bg-background/80 backdrop-blur hover:bg-background text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            {canActuallyRetry && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 bg-background/80 backdrop-blur hover:bg-background text-xs"
                onClick={handleRetry}
                disabled={retrying}
                title="Retry this message"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
            {canActuallyBranch && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 bg-background/80 backdrop-blur hover:bg-background text-xs"
                onClick={handleBranch}
                disabled={branching}
              >
                <GitBranch className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Component for displaying images in messages (larger size)
function MessageImageAttachment({ attachment, messageId: _messageId, sharedChatId }: { attachment: Attachment; messageId: string; sharedChatId?: string }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [persistedBlobUrl, setPersistedBlobUrl] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const setupImageSrc = async () => {
      // Priority 1: If we already have a persisted blob URL from initial upload, keep using it
      if (persistedBlobUrl) {
        setImageSrc(persistedBlobUrl);
        return;
      }

      // Priority 2: If we have the actual File object (for optimistic/pending uploads)
      if (attachment.file && attachment.fileType.startsWith('image/')) {
        const blobUrl = URL.createObjectURL(attachment.file);
        setImageSrc(blobUrl);
        setPersistedBlobUrl(blobUrl); // Persist this blob URL
        return;
      }

      // Priority 3: If we have a previewUrl (existing blob URL)
      if (attachment.previewUrl) {
        setImageSrc(attachment.previewUrl);
        setPersistedBlobUrl(attachment.previewUrl); // Persist this as well
        return;
      }

      // Priority 4: If we have a direct URL
      if (attachment.url) {
        setImageSrc(attachment.url);
        return;
      }

      // Priority 5: If we have a file ID, try to fetch from server (only if no persisted blob)
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
            let blob: Blob;
            
            // Use shared chat file endpoint if in shared context
            if (sharedChatId) {
              blob = await getSharedChatFile(sharedChatId, attachment.id);
            } else {
              blob = await getFile(attachment.id);
            }
            
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

    // Cleanup function - only clean up if we created the blob URL
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:') && attachment.file) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [attachment.id, attachment.file, attachment.previewUrl, attachment.url, attachment.status, persistedBlobUrl]);

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (persistedBlobUrl && persistedBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(persistedBlobUrl);
      }
    };
  }, [persistedBlobUrl]);

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
      <div className={cn(
        "bg-muted rounded-lg flex items-center justify-center border",
        isMobile ? "max-w-[280px] max-h-[280px]" : "max-w-[300px] max-h-[300px]"
      )}>
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
      <div className={cn(
        "bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/30",
        isMobile ? "max-w-[280px] max-h-[280px]" : "max-w-[300px] max-h-[300px]"
      )}>
        <div className="text-center p-4">
          <div className="text-sm font-medium text-muted-foreground">
            {isTrulyUploading ? 'Uploading...' : 
             error ? 'Failed to load' : 
             isLikelyUploaded ? 'Loading image...' : 
             'Image not available'}
          </div>
          <div className="text-xs text-muted-foreground mt-1 break-words">
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
          className={cn(
            "w-auto h-auto object-contain rounded-lg cursor-zoom-in",
            isMobile 
              ? "max-w-[min(280px,calc(100vw-2rem))] max-h-[280px]" 
              : "max-w-[300px] max-h-[300px]"
          )}
          onClick={handleImageClick}
          onError={handleImageError}
        />
      </div>

      {/* Image viewer dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className={cn(
          isMobile ? "max-w-[95vw]" : "max-w-4xl"
        )}>
          <DialogHeader>
            <DialogTitle className="break-words">{attachment.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <img
              src={imageSrc}
              alt={attachment.filename}
              className={cn(
                "object-contain rounded",
                isMobile 
                  ? "max-w-full max-h-[60vh]" 
                  : "max-w-full max-h-[70vh]"
              )}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 