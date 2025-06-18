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
import { FileAttachment } from './FileAttachment';
import { ChatBranchInfo } from './ChatBranchInfo';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { Send, Paperclip, X, File, ArrowDown, Square } from 'lucide-react';
import { Attachment } from '../../types/chat';
import { v4 as uuidv4 } from 'uuid';
import { requiresAnalysisModel, findBestAnalysisModel, getModelSwitchReason } from '../../utils/modelUtils';

export function ChatInput({ showScrollButton, onScrollToBottom, autoFocus }: { 
  showScrollButton?: boolean; 
  onScrollToBottom?: () => void; 
  autoFocus?: boolean;
} = {}) {
  const navigate = useNavigate();
  const { sendMessage, isStreaming, createChat, availableModels, selectedModelId, selectModel, cancelStreamingMessage } = useChat();
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

  // Auto-focus on empty chat welcome screen
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      // Small delay to ensure the component is fully rendered and any animations are complete
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  // Auto-focus when streaming completes (input becomes re-enabled)
  useEffect(() => {
    if (!isStreaming && textareaRef.current && !autoFocus) {
      // Small delay to ensure the streaming state has fully updated
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isStreaming, autoFocus]);

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
    
    // Check if any of the new files require analysis capabilities
    if (requiresAnalysisModel(files)) {
      const bestAnalysisModel = findBestAnalysisModel(availableModels, selectedModelId);
      
      if (bestAnalysisModel && bestAnalysisModel.id !== selectedModelId) {
        console.log('[CHAT-INPUT] Auto-switching to analysis model:', bestAnalysisModel.name);
        selectModel(bestAnalysisModel.id);
        
        // You could add a toast notification here if desired
        // toast.info(getModelSwitchReason(files));
      }
    }
    
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
    
    // Auto-focus the chat input after file selection
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
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
        "mx-auto transition-all duration-300 ease-in-out",
        isSidebarOpen && !isMobile ? 'max-w-3xl' : 'max-w-4xl'
      )}>


        {/* Branch info and scroll to bottom button */}
        <div className="flex justify-between items-end pr-4">
          {/* Branch info - positioned to align with text input */}
          <div className="flex-1 flex justify-start pl-4">
            {chatId && <ChatBranchInfo chatId={chatId} />}
          </div>
          
          {/* Scroll to bottom button with margin */}
          <div className={cn(
            "mb-3 transition-all duration-300 ease-in-out",
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
        </div>

        {/* Main input container - glassmorphism overlay design */}
        <div className="relative bg-background/80 backdrop-blur-lg border border-b-0 rounded-t-2xl shadow-2xl overflow-hidden">
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

          {/* Attachments preview - inside the input container */}
          {attachedFiles.length > 0 && (
            <div className="px-4 pb-2 dark:bg-input/30">
              <div className="flex flex-wrap gap-2">
                {/* Image attachments */}
                {attachedFiles
                  .filter(att => att.fileType.startsWith('image/'))
                  .map((attachment) => (
                    <ImageAttachment
                      key={attachment.id}
                      attachment={attachment}
                      onRemove={() => removeFile(attachedFiles.findIndex(att => att.id === attachment.id))}
                    />
                  ))}
                
                {/* Non-image file attachments */}
                {attachedFiles
                  .filter(att => !att.fileType.startsWith('image/'))
                  .map((attachment) => (
                    <FileAttachment
                      key={attachment.id}
                      attachment={attachment}
                      variant="compact"
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

            {/* Right side - Send button */}
            <div className="flex items-center gap-3">
              {/* Send button with animated gradient border */}
              <div className="relative group">
                {/* Animated border - now muted by default */}
                <div className="absolute -inset-px bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 dark:from-blue-600 dark:via-purple-600 dark:to-blue-600 rounded-full opacity-20 group-hover:opacity-40 dark:opacity-25 dark:group-hover:opacity-55 animate-pulse"></div>
                <div className="absolute -inset-px bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 dark:from-blue-500 dark:via-purple-500 dark:to-blue-500 rounded-full animate-spin-slow opacity-8 dark:opacity-10"></div>
                
                {/* Disabled overlay - only show when not streaming and conditions are met */}
                {!isStreaming && (isDisabled || (!message.trim() && attachedFiles.length === 0)) && (
                  <div className="absolute -inset-px rounded-full bg-black/40 dark:bg-black/60 z-10"></div>
                )}
                
                {isStreaming ? (
                  <Button
                    onClick={cancelStreamingMessage}
                    variant="outline"
                    size="sm"
                    className="relative h-8 w-8 p-0 rounded-full bg-gradient-to-r from-red-100 via-orange-100 to-red-50 hover:from-red-200 hover:via-orange-200 hover:to-red-100 dark:from-red-950 dark:via-red-900/60 dark:to-red-950 dark:hover:from-red-950 dark:hover:via-red-900/80 dark:hover:to-red-950 bg-[length:200%_200%] animate-gradient-shift text-red-800 dark:text-red-100 border border-red-200 dark:border-red-800 shadow-md hover:shadow-lg dark:shadow-lg dark:hover:shadow-xl transition-all duration-200"
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSend}
                    disabled={isDisabled || (!message.trim() && attachedFiles.length === 0)}
                    variant="outline"
                    size="sm"
                    className="relative h-8 w-8 p-0 rounded-full bg-gradient-to-r from-slate-100 via-blue-100 to-slate-50 hover:from-slate-200 hover:via-blue-200 hover:to-slate-100 dark:from-slate-950 dark:via-slate-900/60 dark:to-slate-950 dark:hover:from-slate-950 dark:hover:via-slate-900/80 dark:hover:to-slate-950 bg-[length:200%_200%] animate-gradient-shift text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 shadow-md hover:shadow-lg dark:shadow-lg dark:hover:shadow-xl transition-all duration-200 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4 transform translate-x-[-1px] translate-y-[1px]" />
                  </Button>
                )}
              </div>
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



 