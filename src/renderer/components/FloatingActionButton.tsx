import React, { useRef, useState } from 'react';
import { motion, AnimatePresence, Transition } from 'framer-motion';
import { Fab, FabProps, Box } from '@mui/material';

interface FloatingActionButtonProps extends Omit<FabProps, 'variant'> {
  variant?: 'circular' | 'extended' | 'ripple';
  rippleColor?: string;
  expandOnHover?: boolean;
  actions?: Array<{
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
  }>;
}

const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  children,
  variant = 'circular',
  rippleColor = 'rgba(82, 82, 82, 0.28)',
  expandOnHover = false,
  actions = [],
  sx,
  onClick,
  ...props
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const nextRippleId = useRef(0);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (variant === 'ripple') {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const newRipple = { id: nextRippleId.current++, x, y };
      
      setRipples(prev => [...prev, newRipple]);
      
      // Remove ripple after animation
      setTimeout(() => {
        setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
      }, 600);
    }
    
    onClick?.(event);
  };

  const getMotionProps = () => {
    const springTransition: Transition = { type: 'spring', stiffness: 400, damping: 17 };
    const rippleTransition: Transition = { type: 'spring', stiffness: 300, damping: 20 };

    switch (variant) {
      case 'extended':
        return {
          whileHover: { scale: 1.05 },
          whileTap: { scale: 0.95 },
          transition: springTransition
        };
      case 'ripple':
        return {
          whileHover: { scale: 1.1 },
          whileTap: { scale: 0.9 },
          transition: rippleTransition
        };
      default: // circular
        return {
          whileHover: {
            scale: expandOnHover ? 1.1 : 1.05,
            rotate: expandOnHover ? 180 : 0
          },
          whileTap: { scale: 0.95 },
          transition: springTransition
        };
    }
  };

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Main FAB */}
      <motion.div {...getMotionProps()}>
        <Fab
          sx={{
            position: 'relative',
            overflow: 'hidden',
            ...sx
          }}
          onClick={handleClick}
          onMouseEnter={() => expandOnHover && setIsExpanded(true)}
          onMouseLeave={() => expandOnHover && setIsExpanded(false)}
          {...props}
        >
          {children}
          
          {/* Ripple Effects */}
          {variant === 'ripple' && (
            <AnimatePresence>
              {ripples.map((ripple) => (
                <motion.div
                  key={ripple.id}
                  initial={{ scale: 0, opacity: 0.6 }}
                  animate={{ scale: 4, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    left: ripple.x,
                    top: ripple.y,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: rippleColor,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none'
                  }}
                />
              ))}
            </AnimatePresence>
          )}
        </Fab>
      </motion.div>

      {/* Expandable Actions */}
      {expandOnHover && actions.length > 0 && (
        <AnimatePresence>
          {isExpanded && (
            <Box
              sx={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                mb: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                alignItems: 'center'
              }}
            >
              {actions.map((action, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0, 
                    scale: 1,
                    transition: { delay: index * 0.1 }
                  }}
                  exit={{ 
                    opacity: 0, 
                    y: 20, 
                    scale: 0.8,
                    transition: { delay: (actions.length - index - 1) * 0.05 }
                  }}
                >
                  <Fab
                    size="small"
                    onClick={action.onClick}
                    sx={{
                      backgroundColor: 'background.paper',
                      color: 'text.primary',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      '&:hover': {
                        backgroundColor: 'primary.main',
                        color: 'primary.contrastText'
                      }
                    }}
                  >
                    {action.icon}
                  </Fab>
                </motion.div>
              ))}
            </Box>
          )}
        </AnimatePresence>
      )}
    </Box>
  );
};

export default FloatingActionButton;
