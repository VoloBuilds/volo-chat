import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from './button';

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn("prose prose-base dark:prose-invert w-full min-w-0 max-w-full prose-code:text-base prose-pre:text-base overflow-hidden", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }: any) {
            const inline = !className;
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (!inline && language) {
              return <CodeBlock language={language} code={String(children).replace(/\n$/, '')} {...props} />;
            }
            
            // Inline code
            return (
              <code 
                className="bg-muted/50 rounded px-1.5 py-0.5 text-base font-mono break-words"
                {...props}
              >
                {children}
              </code>
            );
          },
          
          // Style other elements
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-muted-foreground/20 pl-4 italic text-muted-foreground my-4">
                {children}
              </blockquote>
            );
          },
          
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4 max-w-full">
                <table className="min-w-full divide-y divide-border">
                  {children}
                </table>
              </div>
            );
          },
          
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                {children}
              </th>
            );
          },
          
          td({ children }) {
            return (
              <td className="px-3 py-2 text-base border-b border-border">
                {children}
              </td>
            );
          },
          
          ul({ children }) {
            return <ul className="list-disc pl-6 space-y-1 my-2">{children}</ul>;
          },
          
          ol({ children }) {
            return <ol className="list-decimal pl-6 space-y-1 my-2">{children}</ol>;
          },
          
          li({ children }) {
            return <li className="text-base leading-relaxed">{children}</li>;
          },
          
          h1({ children }) {
            return <h1 className="text-xl font-semibold mt-6 mb-4 first:mt-0">{children}</h1>;
          },
          
          h2({ children }) {
            return <h2 className="text-lg font-semibold mt-5 mb-3 first:mt-0">{children}</h2>;
          },
          
          h3({ children }) {
            return <h3 className="text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h3>;
          },
          
          p({ children }) {
            return <p className="text-base leading-relaxed mb-3 last:mb-0">{children}</p>;
          },
          
          a({ href, children }) {
            return (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Separate component for code blocks with copy functionality
function CodeBlock({ language, code, ...props }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  return (
    <div className="group relative my-4 w-full min-w-0 max-w-full overflow-hidden">
      {/* Language label */}
      <div className="bg-muted/50 rounded-t-lg px-3 py-1 text-xs font-medium text-muted-foreground border-b flex justify-between items-center">
        <span>{language}</span>
        {/* Copy button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/50"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-5 w-5 text-green-500" />
          ) : (
            <Copy className="h-5 w-5" />
          )}
        </Button>
      </div>
      {/* Code block with constrained width and horizontal scroll */}
      <div className="overflow-x-auto max-w-full">
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomLeftRadius: '0.5rem',
            borderBottomRightRadius: '0.5rem',
            fontSize: '1rem', // text-base equivalent (16px)
            maxWidth: '100%',
            overflowX: 'auto',
            whiteSpace: 'pre', // Prevent wrapping, allow horizontal scroll
          }}
          {...props}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
} 