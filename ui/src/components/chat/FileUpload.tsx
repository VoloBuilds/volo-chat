import { useRef, useState, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Upload, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  disabled?: boolean;
  children?: ReactNode;
  accept?: string;
  maxSize?: number; // in bytes
  maxFiles?: number;
}

export function FileUpload({
  onFileSelect,
  disabled = false,
  children,
  accept = "image/*,.pdf,.txt,.md,.doc,.docx,.json,.csv,.xls,.xlsx,.rtf",
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 5,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFiles = (files: FileList): File[] => {
    const validFiles: File[] = [];
    let errorMessage = '';

    if (files.length > maxFiles) {
      errorMessage = `Maximum ${maxFiles} files allowed`;
      setError(errorMessage);
      return [];
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check file size
      if (file.size > maxSize) {
        errorMessage = `File "${file.name}" is too large. Maximum size is ${(maxSize / (1024 * 1024)).toFixed(1)}MB`;
        break;
      }

      // Check file type (basic validation)
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'text/plain', 'text/markdown',
        'application/json',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/rtf',
        'application/rtf'
      ];

      if (!allowedTypes.some(type => file.type.startsWith(type.split('/')[0]) || file.type === type)) {
        errorMessage = `File type "${file.type}" is not supported`;
        break;
      }

      validFiles.push(file);
    }

    if (errorMessage) {
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
      return [];
    }

    setError(null);
    return validFiles;
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles = validateFiles(files);
    if (validFiles.length > 0) {
      onFileSelect(validFiles);
    }
  };

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  if (children) {
    return (
      <>
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative cursor-pointer",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          {children}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={disabled}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          "hover:border-primary hover:bg-muted/50",
          isDragOver && "border-primary bg-muted/50",
          disabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-transparent"
        )}
      >
        <div className="flex flex-col items-center gap-4">
          <Upload className="h-12 w-12 text-muted-foreground" />
          <div>
            <p className="text-lg font-medium">Drop files here</p>
            <p className="text-sm text-muted-foreground">
              or click to select files
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            <p>Supported: Images, PDF, Text, Word documents</p>
            <p>Maximum {maxFiles} files, {(maxSize / (1024 * 1024)).toFixed(1)}MB each</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          disabled={disabled}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 bg-destructive/10 text-destructive px-3 py-2 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}
    </>
  );
} 