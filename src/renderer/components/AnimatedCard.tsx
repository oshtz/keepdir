import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardProps } from '@mui/material';

interface AnimatedCardProps extends CardProps {
  animationType?: 'hover' | 'tilt' | 'glow' | 'slide' | 'scale';
  glowColor?: string;
  delay?: number;
}

const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  animationType = 'hover',
  glowColor: _glowColor = 'rgba(82, 82, 82, 0.28)',
  delay = 0,
  sx,
  ...props
}) => {
  const getAnimationProps = () => {
    switch (animationType) {
      case 'tilt':
        return {
          whileHover: {
            scale: 1.01,
            transition: { duration: 0.3 }
          },
          style: {
            transformStyle: 'preserve-3d' as const,
            perspective: 1000
          }
        };
      case 'glow':
        return {
          whileHover: {
            scale: 1.01,
            transition: { duration: 0.3 }
          },
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.5 }
        };
      case 'slide':
        return {
          whileHover: {
            y: -1,
            transition: { duration: 0.2 }
          },
          initial: { opacity: 0, x: -8 },
          animate: { opacity: 1, x: 0 },
          transition: { delay, duration: 0.4 }
        };
      case 'scale':
        return {
          whileHover: {
            scale: 1.01,
            transition: { duration: 0.2 }
          },
          whileTap: {
            scale: 0.98
          },
          initial: { opacity: 0, scale: 0.98 },
          animate: { opacity: 1, scale: 1 },
          transition: { delay, duration: 0.3 }
        };
      default: // hover
        return {
          whileHover: {
            y: -1,
            transition: { duration: 0.2 }
          },
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.4 }
        };
    }
  };

  return (
    <motion.div {...getAnimationProps()}>
      <Card
        sx={{
          cursor: 'pointer',
          overflow: 'visible',
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'divider',
          backgroundImage: 'none',
          ...sx
        }}
        {...props}
      >
        {children}
      </Card>
    </motion.div>
  );
};

export default AnimatedCard;
