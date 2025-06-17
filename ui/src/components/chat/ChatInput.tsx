import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../hooks/useChat';
import { useCurrentChat } from '../../hooks/useCurrentChat';

import { useSidebar } from '../ui/sidebar';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { FileUpload } from './FileUpload';
import { ModelSelector } from './ModelSelector';
import { ImageAttachment } from './ImageAttachment';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { Send, Paperclip, X, File, ArrowDown } from 'lucide-react';
import { Attachment } from '../../types/chat';
import { v4 as uuidv4 } from 'uuid';

export function ChatInput({ showScrollButton, onScrollToBottom }: { 
  showScrollButton?: boolean; 
  onScrollToBottom?: () => void; 
} = {}) {
  const navigate = useNavigate();
  const { sendMessage, isStreaming, createChat } = useChat();
  const { chatId } = useCurrentChat(); // Get chatId from URL
  const { open: isSidebarOpen, isMobile } = useSidebar();
  const [message, setMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ src: string; name: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 150; // Max height in pixels (about 6 lines)
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [message]);

  const handleSend = async () => {
    if (!message.trim() && attachedFiles.length === 0) return;
    if (isStreaming) return;

    const messageToSend = message.trim();
    const attachmentsToSend = [...attachedFiles];

    console.log('[CHAT-INPUT] Sending message:', {
      messageLength: messageToSend.length,
      attachedFiles: attachmentsToSend.length,
      chatId,
      fileDetails: attachmentsToSend.map(att => ({
        id: att.id,
        filename: att.filename,
        fileType: att.fileType,
        fileSize: att.fileSize,
        hasFile: !!att.file
      }))
    });

    // Extract File objects and create blob URL map for the chat store
    const filesToSend = attachmentsToSend
      .filter(att => att.file)
      .map(att => att.file!);
    
    const blobUrlMap = new Map<File, string>();
    attachmentsToSend.forEach(att => {
      if (att.file && att.fileType.startsWith('image/')) {
        const blobUrl = URL.createObjectURL(att.file);
        blobUrlMap.set(att.file, blobUrl);
      }
    });

    // Clear input immediately
    setMessage('');
    setAttachedFiles([]);

    try {
      // Create chat if none exists (no chatId in URL means we're on welcome screen)
      if (!chatId) {
        console.log('[CHAT-INPUT] Creating new chat');
        const newChatId = await createChat();
        console.log('[CHAT-INPUT] New chat created:', newChatId);

        // Navigate to the new chat URL
        navigate(`/chat/${newChatId}`);

        // Send the message to the newly created chat using store directly
        console.log('[CHAT-INPUT] Sending message to newly created chat');
        const { useChatStore } = await import('../../stores/chatStore');
        const { sendMessage: directSendMessage } = useChatStore.getState();
        await directSendMessage(newChatId, messageToSend, filesToSend, blobUrlMap);
      } else {
        console.log('[CHAT-INPUT] Sending message to existing chat:', chatId);
        await sendMessage(messageToSend, filesToSend, blobUrlMap);
      }
      
      console.log('[CHAT-INPUT] Message sent successfully');
    } catch (error) {
      console.error('[CHAT-INPUT] Failed to send message:', error);
      // Restore message on error
      setMessage(messageToSend);
      setAttachedFiles(attachmentsToSend);
      
      // Clean up blob URLs on error
      blobUrlMap.forEach(url => URL.revokeObjectURL(url));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't send during IME composition
    if (isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (files: File[]) => {
    console.log('[CHAT-INPUT] Files selected:', files.map(f => ({
      name: f.name,
      type: f.type,
      size: f.size
    })));
    
    // Convert files to attachments with temporary IDs
    const newAttachments: Attachment[] = files.map(file => ({
      id: `temp-${uuidv4()}`, // Temporary ID for optimistic UI
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
      status: 'pending',
      file, // Attach the actual File object for upload and preview
    }));
    
    setAttachedFiles(prev => [...prev, ...newAttachments]);
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const openImageViewer = (attachment: Attachment) => {
    if (attachment.file && attachment.fileType.startsWith('image/')) {
      const src = URL.createObjectURL(attachment.file);
      setViewingImage({ src, name: attachment.filename });
      setImageViewerOpen(true);
    }
  };

  const closeImageViewer = () => {
    if (viewingImage?.src) {
      URL.revokeObjectURL(viewingImage.src);
    }
    setViewingImage(null);
    setImageViewerOpen(false);
  };

  // Cleanup URLs on component unmount
  useEffect(() => {
    return () => {
      if (viewingImage?.src && viewingImage.src.startsWith('blob:')) {
        URL.revokeObjectURL(viewingImage.src);
      }
    };
  }, [viewingImage]);

  const isDisabled = isStreaming;

  return (
    <div 
      className={cn(
        "fixed bottom-0 right-0 z-50 transition-all duration-300 ease-in-out",
        isSidebarOpen && !isMobile ? "left-64" : "left-0"
      )}
    >
      <div className={cn(
        "mx-auto space-y-3 transition-all duration-300 ease-in-out",
        isSidebarOpen && !isMobile ? 'max-w-3xl' : 'max-w-4xl'
      )}>
        {/* Non-image file attachments preview */}
        {attachedFiles.filter(att => !att.fileType.startsWith('image/')).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachedFiles
              .filter(att => !att.fileType.startsWith('image/'))
              .map((attachment, index) => (
                <FilePreviewCard
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => removeFile(attachedFiles.findIndex(att => att.id === attachment.id))}
                />
              ))}
          </div>
        )}

        {/* Scroll to bottom button */}
        <div className={cn(
          "flex justify-end pr-4 transition-all duration-300 ease-in-out",
          showScrollButton 
            ? "opacity-100 translate-y-0 pointer-events-auto" 
            : "opacity-0 translate-y-2 pointer-events-none"
        )}>
          <Button
            onClick={onScrollToBottom}
            size="sm"
            className="bg-primary text-primary-foreground w-10 h-10 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>

        {/* Main input container - glassmorphism overlay design */}
        <div className="relative bg-background/80 backdrop-blur-lg border rounded-t-2xl shadow-2xl overflow-hidden">
          {/* Message input */}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder={isMobile ? "Type your message..." : "Type your message... (Enter to send, Shift+Enter for new line)"}
              disabled={isDisabled}
              className="min-h-[52px] max-h-[150px] resize-none border-0 focus:ring-0 focus-visible:ring-0 bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground/70"
              style={{ resize: 'none' }}
            />
          </div>

          {/* Image attachments preview - inside the input container */}
          {attachedFiles.filter(att => att.fileType.startsWith('image/')).length > 0 && (
            <div className="px-4 pb-2 dark:bg-input/30">
              <div className="flex flex-wrap gap-2">
                {attachedFiles
                  .filter(att => att.fileType.startsWith('image/'))
                  .map((attachment) => (
                    <ImageAttachment
                      key={attachment.id}
                      attachment={attachment}
                      onRemove={() => removeFile(attachedFiles.findIndex(att => att.id === attachment.id))}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Bottom controls - integrated directly */}
          <div className="flex items-center justify-between px-4 py-2 dark:bg-input/30">
            {/* Left side - Model selector and Upload */}
            <div className="flex items-center gap-3">
              <div className="[&>button]:bg-transparent [&>button]:border-transparent [&>button]:shadow-none [&>button]:backdrop-blur-none [&>button]:hover:bg-white/10">
                <ModelSelector />
              </div>
              
              <FileUpload onFileSelect={handleFileSelect} disabled={isDisabled}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isDisabled}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-white/10 bg-transparent"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </FileUpload>
            </div>

            {/* Right side - Character count and Send button */}
            <div className="flex items-center gap-3">
              {message.length > 500 ? (
                <span className={cn(
                  "text-xs",
                  message.length > 2000 ? "text-destructive" : "text-warning"
                )}>
                  {message.length} characters
                </span>
              ) : null}
              
              <Button
                onClick={handleSend}
                disabled={isDisabled || (!message.trim() && attachedFiles.length === 0)}
                size="sm"
                className="h-8 w-8 p-0 rounded-full"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Image viewer dialog */}
      <Dialog open={imageViewerOpen} onOpenChange={closeImageViewer}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{viewingImage?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {viewingImage && (
              <img
                src={viewingImage.src}
                alt={viewingImage.name}
                className="max-w-full max-h-[70vh] object-contain rounded"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Separate component for file preview cards (non-images only now)
function FilePreviewCard({ 
  attachment, 
  onRemove
}: { 
  attachment: Attachment;
  onRemove: () => void;
}) {
  return (
    <div className="relative group bg-background/80 backdrop-blur-lg border border-border/50 rounded-t-lg p-2 shadow-lg">
      <div className="flex items-center gap-2">
        <div className="w-12 h-12 bg-muted/60 backdrop-blur-sm rounded flex items-center justify-center">
          <File className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate max-w-[120px]">{attachment.filename}</span>
          <span className="text-xs text-muted-foreground">
            {(attachment.fileSize / 1024).toFixed(1)} KB • Ready to send
          </span>
        </div>
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-destructive/90 backdrop-blur-sm text-destructive-foreground hover:bg-destructive/95 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

 