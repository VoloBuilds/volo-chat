import { useState } from 'react';
import { Message } from '../../types/chat';
import { Button } from '../ui/button';
import { Markdown } from '../ui/markdown';
import { cn } from '../../lib/utils';
import { Copy, Check, File } from 'lucide-react';
import { ImageAttachment } from './ImageAttachment';

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
}

export function MessageBubble({ message, isLast: _isLast }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const renderAttachments = () => {
    if (!message.attachments || message.attachments.length === 0) return null;

    console.log('[MESSAGE-BUBBLE] renderAttachments called:', {
      messageId: message.id,
      role: message.role,
      isOptimistic: message.isOptimistic,
      attachmentCount: message.attachments.length,
      attachments: message.attachments.map(att => ({
        id: att.id,
        filename: att.filename,
        fileType: att.fileType,
        status: att.status,
        hasUrl: !!att.url,
      }))
    });
    
    // Separate images from other attachments
    const images = message.attachments.filter(att => att.fileType.startsWith('image/'));
    const otherAttachments = message.attachments.filter(att => !att.fileType.startsWith('image/'));

    return (
      <div className="mt-3 space-y-3">
        {/* Display images using ImageAttachment component */}
        {images.length > 0 && (
          <div className={cn(
            "gap-3",
            images.length === 1 
              ? "flex justify-start" 
              : images.length === 2
              ? "grid grid-cols-2 max-w-md"
              : "grid grid-cols-3 max-w-lg"
          )}>
            {images.map((attachment) => (
              <ImageAttachment
                key={attachment.id}
                attachment={attachment}
                messageId={message.id}
              />
            ))}
          </div>
        )}

        {/* Display other attachments as info cards */}
        {otherAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {otherAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 p-3 bg-background/50 rounded-lg border text-sm max-w-xs"
              >
                <div className="w-8 h-8 bg-muted rounded flex items-center justify-center flex-shrink-0">
                  <File className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-medium truncate">{attachment.filename}</span>
                  <span className="text-xs text-muted-foreground">
                    {(attachment.fileSize / 1024).toFixed(1)} KB
                    {attachment.status && ` • ${attachment.status}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    return <Markdown content={message.content} />;
  };

  if (isUser) {
    // User messages: bubble style, positioned right, with images above
    const images = message.attachments?.filter(att => att.fileType.startsWith('image/')) || [];
    const otherAttachments = message.attachments?.filter(att => !att.fileType.startsWith('image/')) || [];

    return (
      <div className="group w-full flex flex-col items-end">
        {/* Images above the bubble */}
        {images.length > 0 && (
          <div className={cn(
            "mb-2 gap-3",
            images.length === 1 
              ? "flex justify-end" 
              : images.length === 2
              ? "grid grid-cols-2 max-w-md"
              : "grid grid-cols-3 max-w-lg"
          )}>
            {images.map((attachment) => (
              <ImageAttachment
                key={attachment.id}
                attachment={attachment}
                messageId={message.id}
              />
            ))}
          </div>
        )}

        <div className="relative max-w-[85%] md:max-w-[80%] lg:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm bg-primary text-primary-foreground">
          {/* Content */}
          <div>
            {renderContent()}
            {/* Only show non-image attachments in the bubble */}
            {otherAttachments.length > 0 && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {otherAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 p-3 bg-background/50 rounded-lg border text-sm max-w-xs"
                    >
                      <div className="w-8 h-8 bg-muted rounded flex items-center justify-center flex-shrink-0">
                        <File className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium truncate">{attachment.filename}</span>
                        <span className="text-xs text-muted-foreground">
                          {(attachment.fileSize / 1024).toFixed(1)} KB
                          {attachment.status && ` • ${attachment.status}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Copy button on hover */}
          {!message.isStreaming && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
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
  } else {
    // AI messages: no bubble, directly on canvas, full width with animation
    return (
      <div className="group w-full">
        <div className={cn(
          "w-full px-2 py-2",
          message.isStreaming && "animate-fade-in"
        )}>
          {/* Model indicator */}
          {message.modelId && (
            <div className="text-xs text-muted-foreground mb-2 opacity-70">
              {message.modelId.replace(/^(claude-|gpt-|gemini-)/, '').toUpperCase()}
            </div>
          )}

          {/* Content with streaming animation */}
          <div className={cn(
            "prose prose-neutral dark:prose-invert max-w-none",
            message.isStreaming && "animate-type-in"
          )}>
            {renderContent()}
            {renderAttachments()}
          </div>

          {/* Copy button on hover */}
          {!message.isStreaming && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted"
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
} 