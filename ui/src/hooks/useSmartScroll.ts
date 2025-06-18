import { useEffect, useRef, useState, useCallback } from 'react';
import { Message } from '../types/chat';

export function useSmartScroll(messages: Message[], isStreaming: boolean) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollingRef = useRef(false);

  // Get the actual scrollable viewport from Radix ScrollArea
  const getScrollViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
  }, []);

  // Check if we're at the bottom with exact precision
  const checkIfAtBottom = useCallback(() => {
    const viewport = getScrollViewport();
    if (!viewport) return false;
    
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 3; // Very precise threshold
    
    return isAtBottom;
  }, [getScrollViewport]);

  // Scroll to bottom function - gravity style
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    const viewport = getScrollViewport();
    if (!viewport) return;
    
    // Calculate the correct scroll position to reach the bottom
    const { scrollHeight, clientHeight } = viewport;
    const targetScrollTop = scrollHeight - clientHeight;
    
    if (behavior === 'smooth') {
      viewport.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
    } else {
      viewport.scrollTop = targetScrollTop;
    }
  }, [getScrollViewport]);

  // User scroll detection - very responsive
  useEffect(() => {
    const viewport = getScrollViewport();
    if (!viewport) return;

    const handleScroll = () => {
      // Mark as user scrolling to prevent interference
      if (!isUserScrollingRef.current) {
        isUserScrollingRef.current = true;
        
        // Check if user scrolled away from bottom
        const atBottom = checkIfAtBottom();
        setIsAtBottom(atBottom);
        
        // Show scroll button if not at bottom and have messages
        if (!atBottom && messages.length > 0) {
          setShowScrollButton(true);
        } else {
          setShowScrollButton(false);
        }
        
        // Reset user scrolling flag after a delay
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 150);
      }
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [checkIfAtBottom, messages.length]);

  // Intersection Observer for precise bottom detection
  useEffect(() => {
    const viewport = getScrollViewport();
    if (!viewport || !bottomRef.current) {
      return;
    }

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        const atBottom = entry.isIntersecting;
        
        if (!isUserScrollingRef.current) {
          setIsAtBottom(atBottom);
          if (atBottom) {
            setShowScrollButton(false);
          }
        }
      },
      { 
        root: viewport,
        threshold: 0.1,
        rootMargin: '0px'
      }
    );

    observerRef.current.observe(bottomRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [getScrollViewport]);

  // ChatGPT-style gravity scroll: Only scroll if at bottom and not user scrolling
  useEffect(() => {
    if (isAtBottom && !isUserScrollingRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    }
  }, [messages, isAtBottom, scrollToBottom, isStreaming]); // Include isStreaming for more responsive streaming

  // Initial scroll to bottom when messages are first loaded
  useEffect(() => {
    if (messages.length > 0 && isAtBottom && !isUserScrollingRef.current) {
      // For initial load, ensure we scroll to bottom after DOM is ready
      // Use a slight delay to ensure proper rendering
      const timeoutId = setTimeout(() => {
        scrollToBottom('auto');
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, isAtBottom, scrollToBottom]); // Include all dependencies

  // Aggressive scroll maintenance during streaming
  useEffect(() => {
    if (isStreaming && isAtBottom && !isUserScrollingRef.current) {
      // During streaming, more aggressively maintain bottom position
      // This ensures smooth following as content grows
      const intervalId = setInterval(() => {
        const viewport = getScrollViewport();
        if (viewport) {
          const { scrollHeight, clientHeight, scrollTop } = viewport;
          const targetScrollTop = scrollHeight - clientHeight;
          const currentDistanceFromBottom = targetScrollTop - scrollTop;
          
          // If we're more than 5px away from bottom, snap back
          if (currentDistanceFromBottom > 5) {
            viewport.scrollTop = targetScrollTop;
          }
        }
      }, 50); // Check every 50ms during streaming
      
      return () => clearInterval(intervalId);
    }
  }, [isStreaming, isAtBottom, getScrollViewport]);

  // Manual scroll to bottom function
  const handleScrollToBottom = useCallback(() => {
    setShowScrollButton(false);
    setIsAtBottom(true);
    isUserScrollingRef.current = false;
    
    // Use the same scrolling logic for consistency
    scrollToBottom('smooth');
  }, [scrollToBottom]);

  return {
    scrollAreaRef,
    bottomRef,
    isAtBottom,
    showScrollButton,
    scrollToBottom: handleScrollToBottom
  };
} 