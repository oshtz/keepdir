import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { Box, Skeleton } from '@mui/material';

interface LazySectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}

const LazySection: React.FC<LazySectionProps> = ({
  children,
  fallback,
  threshold = 0.1,
  rootMargin = '50px',
  enabled = true
}) => {
  const [isVisible, setIsVisible] = useState(!enabled);
  const [hasBeenVisible, setHasBeenVisible] = useState(!enabled);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || hasBeenVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    const currentElement = elementRef.current;
    if (currentElement) {
      observer.observe(currentElement);
    }

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
      observer.disconnect();
    };
  }, [enabled, hasBeenVisible, threshold, rootMargin]);

  const defaultFallback = (
    <Box sx={{ p: 2 }}>
      <Skeleton variant="text" width="60%" height={24} sx={{ mb: 1 }} role="progressbar" />
      <Skeleton variant="rectangular" width="100%" height={60} sx={{ borderRadius: 1.5 }} role="progressbar" />
    </Box>
  );

  return (
    <div ref={elementRef}>
      {isVisible || hasBeenVisible ? children : (fallback || defaultFallback)}
    </div>
  );
};

export default LazySection;