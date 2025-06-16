import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../hooks/useChat';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { FileUpload } from './FileUpload';
import { ModelSelector } from './ModelSelector';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { Send, Paperclip, X, Image as ImageIcon, Eye, File } from 'lucide-react';
import { Attachment } from '../../types/chat';
import { v4 as uuidv4 } from 'uuid';

export function ChatInput() {
  const navigate = useNavigate();
  const { sendMessage, isStreaming, activeChatId, createChat } = useChat();
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
            // Create chat if none exists
      if (!activeChatId) {
        console.log('[CHAT-INPUT] Creating new chat');
        const newChatId = await createChat();
        console.log('[CHAT-INPUT] New chat created:', newChatId);

        // Navigate to the new chat URL
        navigate(`/chat/${newChatId}`);

        // Send the message to the newly created chat
        console.log('[CHAT-INPUT] Sending message to newly created chat');
        await sendMessage(messageToSend, filesToSend, blobUrlMap);
      } else {
        console.log('[CHAT-INPUT] Sending message to existing chat:', activeChatId);
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
    <div className="space-y-3">
      {/* File attachments preview */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedFiles.map((attachment, index) => (
            <FilePreviewCard
              key={attachment.id}
              attachment={attachment}
              onRemove={() => removeFile(index)}
              onImageClick={() => openImageViewer(attachment)}
            />
          ))}
        </div>
      )}

      {/* Main input container - floating design */}
      <div className="relative bg-background border border-border rounded-2xl shadow-lg overflow-hidden">
        {/* Message input */}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            disabled={isDisabled}
            className="min-h-[52px] max-h-[150px] resize-none border-0 focus:ring-0 focus-visible:ring-0 bg-transparent px-4 py-3 pr-12 text-base placeholder:text-muted-foreground/70"
            style={{ resize: 'none' }}
          />
          
          {/* Send button inside input */}
          <Button
            onClick={handleSend}
            disabled={isDisabled || (!message.trim() && attachedFiles.length === 0)}
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20">
          {/* Left side - Upload and Model selector */}
          <div className="flex items-center gap-3">
            <FileUpload onFileSelect={handleFileSelect} disabled={isDisabled}>
              <Button
                variant="ghost"
                size="sm"
                disabled={isDisabled}
                className="h-8 px-3 text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="h-4 w-4 mr-1" />
                <span className="text-xs">Attach</span>
              </Button>
            </FileUpload>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Model:</span>
              <ModelSelector />
            </div>
          </div>

          {/* Right side - Character count */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {message.length > 500 ? (
              <span className={cn(
                message.length > 2000 ? "text-destructive" : "text-warning"
              )}>
                {message.length} characters
              </span>
            ) : null}
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

// Separate component for file preview cards
function FilePreviewCard({ 
  attachment, 
  onRemove, 
  onImageClick 
}: { 
  attachment: Attachment;
  onRemove: () => void;
  onImageClick?: () => void;
}) {
  const isImage = attachment.fileType.startsWith('image/');
  
  return (
    <div className="relative group bg-background border rounded-lg p-2 shadow-sm">
      {isImage && attachment.file ? (
        <div className="flex items-center gap-2">
          <ImagePreview 
            file={attachment.file} 
            filename={attachment.filename}
            onClick={onImageClick}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate max-w-[120px]">{attachment.filename}</span>
            <span className="text-xs text-muted-foreground">
              {(attachment.fileSize / 1024).toFixed(1)} KB • Ready to send
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
            <File className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate max-w-[120px]">{attachment.filename}</span>
            <span className="text-xs text-muted-foreground">
              {(attachment.fileSize / 1024).toFixed(1)} KB • Ready to send
            </span>
          </div>
        </div>
      )}
      
      <Button
        variant="ghost"
        size="sm"
        className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// Simple image preview component
function ImagePreview({ 
  file, 
  filename, 
  onClick 
}: { 
  file: File; 
  filename: string;
  onClick?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!src) {
    return (
      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
        <ImageIcon className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div 
      className="relative cursor-pointer group"
      onClick={onClick}
    >
      <img
        src={src}
        alt={filename}
        className="w-12 h-12 object-cover rounded transition-transform group-hover:scale-105"
      />
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
        <Eye className="w-4 h-4 text-white" />
      </div>
    </div>
  );
} 