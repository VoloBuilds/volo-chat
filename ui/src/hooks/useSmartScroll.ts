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
    
    console.log('[useSmartScroll] Bottom check:', {
      scrollTop,
      scrollHeight,
      clientHeight,
      isAtBottom,
      diff: scrollHeight - clientHeight - scrollTop
    });
    
    return isAtBottom;
  }, [getScrollViewport]);

  // Scroll to bottom function - gravity style
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    const viewport = getScrollViewport();
    if (!viewport) return;
    
    console.log('[useSmartScroll] Scrolling to bottom with behavior:', behavior);
    viewport.scrollTop = viewport.scrollHeight;
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
      console.log('[useSmartScroll] Missing viewport or bottomRef');
      return;
    }

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    console.log('[useSmartScroll] Setting up intersection observer');

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        const atBottom = entry.isIntersecting;
        console.log('[useSmartScroll] Intersection changed:', { atBottom, ratio: entry.intersectionRatio });
        
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
      console.log('[useSmartScroll] Gravity scroll: staying at bottom');
      
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    }
  }, [messages, isAtBottom, scrollToBottom]);

  // Manual scroll to bottom function
  const handleScrollToBottom = useCallback(() => {
    console.log('[useSmartScroll] Manual scroll to bottom');
    setShowScrollButton(false);
    setIsAtBottom(true);
    isUserScrollingRef.current = false;
    
    // Use smooth scrollIntoView for manual scroll
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, []);

  return {
    scrollAreaRef,
    bottomRef,
    isAtBottom,
    showScrollButton,
    scrollToBottom: handleScrollToBottom
  };
} 