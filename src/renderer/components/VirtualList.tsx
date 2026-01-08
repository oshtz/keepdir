import React, { useState, useRef, useMemo, ReactNode } from 'react';
import { Box } from '@mui/material';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
}

function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const { visibleItems, totalHeight, offsetY } = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight),
      items.length - 1
    );

    const visibleStartIndex = Math.max(0, startIndex - overscan);
    const visibleEndIndex = Math.min(items.length - 1, endIndex + overscan);

    const visibleItems = items.slice(visibleStartIndex, visibleEndIndex + 1);
    const totalHeight = items.length * itemHeight;
    const offsetY = visibleStartIndex * itemHeight;

    return {
      visibleItems,
      totalHeight,
      offsetY,
      visibleStartIndex,
      visibleEndIndex
    };
  }, [items, itemHeight, scrollTop, containerHeight, overscan]);

  return (
    <Box
      ref={scrollElementRef}
      className={className}
      onScroll={handleScroll}
      sx={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative'
      }}
    >
      <Box
        sx={{
          height: totalHeight,
          position: 'relative'
        }}
      >
        <Box
          sx={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) => {
            const actualIndex = Math.floor(scrollTop / itemHeight) - overscan + index;
            return (
              <Box
                key={actualIndex}
                sx={{
                  height: itemHeight,
                  overflow: 'hidden'
                }}
              >
                {renderItem(item, actualIndex)}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

export default VirtualList;