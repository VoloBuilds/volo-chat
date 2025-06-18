import { useState } from 'react';
import { Attachment } from '../../types/chat';
import { Button } from '../ui/button';
import { useIsMobile } from '../../hooks/use-mobile';
import { cn } from '../../lib/utils';
import { 
  X, 
  FileText, 
  FileCode, 
  File as FileIcon, 
  Download,
  ExternalLink
} from 'lucide-react';

interface FileAttachmentProps {
  attachment: Attachment;
  onRemove?: () => void;
  variant?: 'compact' | 'detailed';
}

export function FileAttachment({ attachment, onRemove, variant = 'detailed' }: FileAttachmentProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const isMobile = useIsMobile();

  const getFileIcon = (fileType: string, filename: string) => {
    if (fileType === 'application/pdf') {
      return <FileText className="h-5 w-5 text-red-500" />;
    }
    if (fileType === 'text/plain' || fileType === 'text/markdown') {
      return <FileText className="h-5 w-5 text-blue-500" />;
    }
    if (fileType === 'application/json' || filename.endsWith('.json')) {
      return <FileCode className="h-5 w-5 text-green-500" />;
    }
    if (fileType.includes('spreadsheet') || filename.endsWith('.csv')) {
      return <FileText className="h-5 w-5 text-green-600" />;
    }
    if (fileType.includes('document') || filename.endsWith('.doc') || filename.endsWith('.docx')) {
      return <FileText className="h-5 w-5 text-blue-600" />;
    }
    return <FileIcon className="h-5 w-5 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileTypeDisplay = (fileType: string, filename: string) => {
    if (fileType === 'application/pdf') return 'PDF';
    if (fileType === 'text/plain') return 'Text';
    if (fileType === 'text/markdown') return 'Markdown';
    if (fileType === 'application/json' || filename.endsWith('.json')) return 'JSON';
    if (filename.endsWith('.csv')) return 'CSV';
    if (fileType.includes('document')) return 'Document';
    return fileType.split('/')[1]?.toUpperCase() || 'File';
  };

  const handleDownload = async () => {
    if (!attachment.url && !attachment.file) return;
    
    setIsDownloading(true);
    try {
      if (attachment.file) {
        // Create download link for file object
        const url = URL.createObjectURL(attachment.file);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (attachment.url) {
        // Direct download from URL
        window.open(attachment.url, '_blank');
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleView = () => {
    if (attachment.file && attachment.fileType === 'text/plain') {
      // For text files, create a blob URL and open in new tab
      const url = URL.createObjectURL(attachment.file);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      handleDownload();
    }
  };

  if (variant === 'compact') {
    return (
      <div className="relative group">
        <div 
          className={cn(
            "flex items-center gap-2 bg-muted/50 border border-border/50 rounded-lg px-3 py-2 hover:bg-muted/70 hover:border-border transition-all duration-200",
            isDownloading ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          )}
          onClick={isDownloading ? undefined : handleView}
        >
          {getFileIcon(attachment.fileType, attachment.filename)}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate max-w-[120px]">
              {attachment.filename}
            </div>
            <div className="text-xs text-muted-foreground">
              {getFileTypeDisplay(attachment.fileType, attachment.filename)} • {formatFileSize(attachment.fileSize)}
            </div>
          </div>
          
          <ExternalLink className="h-3 w-3 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
        
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "absolute -top-2 -right-2 h-5 w-5 p-0 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full transition-opacity",
              isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering the file view when clicking remove
              onRemove();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative group bg-background border border-border/50 rounded-lg p-3 hover:border-border transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 bg-muted/50 rounded-lg">
          {getFileIcon(attachment.fileType, attachment.filename)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium truncate">{attachment.filename}</h4>
            <span className="text-xs px-2 py-1 bg-muted/50 rounded-full">
              {getFileTypeDisplay(attachment.fileType, attachment.filename)}
            </span>
          </div>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            <span>{formatFileSize(attachment.fileSize)}</span>
            {attachment.status && (
              <span className={cn(
                "px-2 py-1 rounded-full",
                attachment.status === 'uploaded' ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                attachment.status === 'pending' ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                attachment.status === 'error' ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                "bg-muted"
              )}>
                {attachment.status}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleView}
              disabled={isDownloading}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              {attachment.fileType === 'text/plain' ? 'View' : 'Open'}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              <Download className="h-3 w-3 mr-1" />
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          </div>
        </div>
        
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 w-6 p-0 text-muted-foreground hover:text-destructive transition-opacity",
              isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
} 