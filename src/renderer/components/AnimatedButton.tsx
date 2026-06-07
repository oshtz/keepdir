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
          whileHover: { scale: 1.02 },
          whileTap: { scale: 0.98 },
          transition: bounceTransition
        };
      case 'slide':
        return {
          whileHover: { x: 1 },
          whileTap: { x: 0 },
          transition: slideTransition
        };
      case 'glow':
        return {
          whileHover: { scale: 1.01 },
          whileTap: { scale: 0.98 },
          transition: glowTransition
        };
      case 'ripple':
        return {
          whileHover: { scale: 1.01 },
          whileTap: { scale: 0.98 },
          transition: rippleTransition
        };
      default: // scale
        return {
          whileHover: { scale: 1.02 },
          whileTap: { scale: 0.98 },
          transition: springTransition
        };
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'gradient':
        return {
          backgroundColor: 'primary.main',
          border: 'none',
          color: 'primary.contrastText',
          '&:hover': {
            backgroundColor: 'primary.dark',
          }
        };
      case 'glow':
        return {
          background: (theme: any) =>
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.07)'
              : 'rgba(0,0,0,0.04)',
          border: '1px solid',
          borderColor: 'divider',
          color: 'primary.main',
          boxShadow: 'none',
          '&:hover': {
            background: (theme: any) =>
              theme.palette.mode === 'dark'
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(0,0,0,0.07)',
            borderColor: 'primary.main',
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
