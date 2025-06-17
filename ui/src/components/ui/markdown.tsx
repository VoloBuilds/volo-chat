import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn("prose prose-base dark:prose-invert w-full min-w-0 prose-code:text-base prose-pre:text-base", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }: any) {
            const inline = !className;
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (!inline && language) {
              return (
                <div className="my-4 w-full min-w-0 overflow-hidden">
                  {/* Language label */}
                  <div className="bg-muted/50 rounded-t-lg px-3 py-1 text-xs font-medium text-muted-foreground border-b">
                    {language}
                  </div>
                  {/* Code block with horizontal scroll */}
                  <div className="overflow-x-auto">
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
                      }}
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                </div>
              );
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
              <div className="overflow-x-auto my-4">
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