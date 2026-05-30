import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AnimatedButton from '../AnimatedButton';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const motionProps = new Set(['whileHover', 'whileTap', 'initial', 'animate', 'exit', 'transition', 'variants']);
      const domProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => !motionProps.has(key))
      );
      return <div data-testid="motion-div" {...domProps}>{children}</div>;
    },
  },
}));

describe('AnimatedButton', () => {
  it('renders with default props', () => {
    render(<AnimatedButton>Test Button</AnimatedButton>);
    
    const button = screen.getByRole('button', { name: 'Test Button' });
    expect(button).toBeInTheDocument();
  });

  it('renders with custom text', () => {
    render(<AnimatedButton>Custom Text</AnimatedButton>);
    
    const button = screen.getByRole('button', { name: 'Custom Text' });
    expect(button).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<AnimatedButton onClick={handleClick}>Click Me</AnimatedButton>);
    
    const button = screen.getByRole('button', { name: 'Click Me' });
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders with contained variant by default', () => {
    render(<AnimatedButton>Default Variant</AnimatedButton>);
    
    const button = screen.getByRole('button', { name: 'Default Variant' });
    expect(button).toHaveClass('MuiButton-contained');
  });

  it('renders with outlined variant', () => {
    render(<AnimatedButton variant="outlined">Outlined Button</AnimatedButton>);
    
    const button = screen.getByRole('button', { name: 'Outlined Button' });
    expect(button).toHaveClass('MuiButton-outlined');
  });

  it('renders with text variant', () => {
    render(<AnimatedButton variant="text">Text Button</AnimatedButton>);
    
    const button = screen.getByRole('button', { name: 'Text Button' });
    expect(button).toHaveClass('MuiButton-text');
  });

  it('renders with gradient variant as contained', () => {
    render(<AnimatedButton variant="gradient">Gradient Button</AnimatedButton>);
    
    const button = screen.getByRole('button', { name: 'Gradient Button' });
    expect(button).toHaveClass('MuiButton-contained');
  });

  it('renders with glow variant as contained', () => {
    render(<AnimatedButton variant="glow">Glow Button</AnimatedButton>);
    
    const button = screen.getByRole('button', { name: 'Glow Button' });
    expect(button).toHaveClass('MuiButton-contained');
  });

  it('applies custom sx styles', () => {
    render(
      <AnimatedButton sx={{ backgroundColor: 'red' }}>
        Styled Button
      </AnimatedButton>
    );
    
    const button = screen.getByRole('button', { name: 'Styled Button' });
    expect(button).toBeInTheDocument();
  });

  it('passes through other button props', () => {
    render(
      <AnimatedButton disabled data-testid="disabled-button">
        Disabled Button
      </AnimatedButton>
    );
    
    const button = screen.getByTestId('disabled-button');
    expect(button).toBeDisabled();
  });

  it('renders with scale animation type by default', () => {
    const { container } = render(
      <AnimatedButton>Scale Animation</AnimatedButton>
    );
    
    // Check that the motion.div wrapper is present
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with bounce animation type', () => {
    const { container } = render(
      <AnimatedButton animationType="bounce">Bounce Animation</AnimatedButton>
    );
    
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with slide animation type', () => {
    const { container } = render(
      <AnimatedButton animationType="slide">Slide Animation</AnimatedButton>
    );
    
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with glow animation type', () => {
    const { container } = render(
      <AnimatedButton animationType="glow">Glow Animation</AnimatedButton>
    );
    
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with ripple animation type', () => {
    const { container } = render(
      <AnimatedButton animationType="ripple">Ripple Animation</AnimatedButton>
    );
    
    expect(container.firstChild).toBeInTheDocument();
  });

  it('combines variant and animation type', () => {
    render(
      <AnimatedButton variant="gradient" animationType="bounce">
        Combined Props
      </AnimatedButton>
    );
    
    const button = screen.getByRole('button', { name: 'Combined Props' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('MuiButton-contained');
  });

  it('renders children correctly', () => {
    render(
      <AnimatedButton>
        <span>Child Element</span>
      </AnimatedButton>
    );
    
    expect(screen.getByText('Child Element')).toBeInTheDocument();
  });
});
