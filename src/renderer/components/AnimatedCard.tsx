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
  glowColor = 'rgba(255, 87, 51, 0.3)',
  delay = 0,
  sx,
  ...props
}) => {
  const getAnimationProps = () => {
    switch (animationType) {
      case 'tilt':
        return {
          whileHover: {
            rotateX: 5,
            rotateY: 5,
            scale: 1.02,
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
            scale: 1.02,
            boxShadow: `0 10px 30px ${glowColor}`,
            transition: { duration: 0.3 }
          },
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.5 }
        };
      case 'slide':
        return {
          whileHover: {
            y: -8,
            transition: { duration: 0.2 }
          },
          initial: { opacity: 0, x: -20 },
          animate: { opacity: 1, x: 0 },
          transition: { delay, duration: 0.4 }
        };
      case 'scale':
        return {
          whileHover: {
            scale: 1.05,
            transition: { duration: 0.2 }
          },
          whileTap: {
            scale: 0.98
          },
          initial: { opacity: 0, scale: 0.9 },
          animate: { opacity: 1, scale: 1 },
          transition: { delay, duration: 0.3 }
        };
      default: // hover
        return {
          whileHover: {
            y: -4,
            boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
            transition: { duration: 0.2 }
          },
          initial: { opacity: 0, y: 20 },
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