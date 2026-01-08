import React from 'react';
import { motion, Transition } from 'framer-motion';
import { Button, ButtonProps } from '@mui/material';

interface AnimatedButtonProps extends Omit<ButtonProps, 'variant'> {
  variant?: 'contained' | 'outlined' | 'text' | 'gradient' | 'glow';
  animationType?: 'scale' | 'bounce' | 'slide' | 'glow' | 'ripple';
}

const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  children,
  variant = 'contained',
  animationType = 'scale',
  sx,
  ...props
}) => {
  const getAnimationProps = () => {
    const springTransition: Transition = { type: 'spring', stiffness: 400, damping: 17 };
    const bounceTransition: Transition = { type: 'spring', stiffness: 400, damping: 17 };
    const slideTransition: Transition = { type: 'spring', stiffness: 300, damping: 20 };
    const glowTransition: Transition = { duration: 0.2 };
    const rippleTransition: Transition = { type: 'spring', stiffness: 500, damping: 30 };

    switch (animationType) {
      case 'bounce':
        return {
          whileHover: { scale: 1.05, y: -2 },
          whileTap: { scale: 0.95, y: 0 },
          transition: bounceTransition
        };
      case 'slide':
        return {
          whileHover: { x: 2, scale: 1.02 },
          whileTap: { x: 0, scale: 0.98 },
          transition: slideTransition
        };
      case 'glow':
        return {
          whileHover: {
            scale: 1.02,
            boxShadow: '0 0 20px rgba(255, 87, 51, 0.4)'
          },
          whileTap: { scale: 0.98 },
          transition: glowTransition
        };
      case 'ripple':
        return {
          whileHover: { scale: 1.03 },
          whileTap: { scale: 0.97 },
          transition: rippleTransition
        };
      default: // scale
        return {
          whileHover: { scale: 1.05 },
          whileTap: { scale: 0.95 },
          transition: springTransition
        };
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'gradient':
        return {
          background: 'linear-gradient(135deg, #FF5733 0%, #FF8C66 100%)',
          border: 'none',
          color: 'white',
          '&:hover': {
            background: 'linear-gradient(135deg, #FF8C66 0%, #FF5733 100%)',
          }
        };
      case 'glow':
        return {
          background: 'rgba(255, 87, 51, 0.1)',
          border: '1px solid rgba(255, 87, 51, 0.3)',
          color: '#FF5733',
          backdropFilter: 'blur(10px)',
          '&:hover': {
            background: 'rgba(255, 87, 51, 0.2)',
            border: '1px solid rgba(255, 87, 51, 0.5)',
          }
        };
      default:
        return {};
    }
  };

  return (
    <motion.div {...getAnimationProps()}>
      <Button
        variant={variant === 'gradient' || variant === 'glow' ? 'contained' : variant}
        sx={{
          ...getVariantStyles(),
          ...sx
        }}
        {...props}
      >
        {children}
      </Button>
    </motion.div>
  );
};

export default AnimatedButton;