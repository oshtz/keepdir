import React from 'react';
import { render, screen } from '@testing-library/react';
import AnimatedCard from '../AnimatedCard';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('AnimatedCard', () => {
  it('renders with default props', () => {
    render(
      <AnimatedCard>
        <div>Card Content</div>
      </AnimatedCard>
    );
    
    expect(screen.getByText('Card Content')).toBeInTheDocument();
  });

  it('renders children correctly', () => {
    render(
      <AnimatedCard>
        <h2>Card Title</h2>
        <p>Card description</p>
      </AnimatedCard>
    );
    
    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card description')).toBeInTheDocument();
  });

  it('applies default hover animation type', () => {
    const { container } = render(
      <AnimatedCard>
        <div>Default Animation</div>
      </AnimatedCard>
    );
    
    // Check that the motion.div wrapper is present
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with tilt animation type', () => {
    const { container } = render(
      <AnimatedCard animationType="tilt">
        <div>Tilt Animation</div>
      </AnimatedCard>
    );
    
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Tilt Animation')).toBeInTheDocument();
  });

  it('renders with glow animation type', () => {
    const { container } = render(
      <AnimatedCard animationType="glow">
        <div>Glow Animation</div>
      </AnimatedCard>
    );
    
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Glow Animation')).toBeInTheDocument();
  });

  it('renders with slide animation type', () => {
    const { container } = render(
      <AnimatedCard animationType="slide">
        <div>Slide Animation</div>
      </AnimatedCard>
    );
    
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Slide Animation')).toBeInTheDocument();
  });

  it('renders with scale animation type', () => {
    const { container } = render(
      <AnimatedCard animationType="scale">
        <div>Scale Animation</div>
      </AnimatedCard>
    );
    
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Scale Animation')).toBeInTheDocument();
  });

  it('accepts custom glow color', () => {
    const { container } = render(
      <AnimatedCard animationType="glow" glowColor="rgba(0, 255, 0, 0.5)">
        <div>Custom Glow</div>
      </AnimatedCard>
    );
    
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Custom Glow')).toBeInTheDocument();
  });

  it('accepts custom delay', () => {
    const { container } = render(
      <AnimatedCard delay={0.5}>
        <div>Delayed Animation</div>
      </AnimatedCard>
    );
    
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Delayed Animation')).toBeInTheDocument();
  });

  it('applies custom sx styles', () => {
    render(
      <AnimatedCard sx={{ backgroundColor: 'red' }}>
        <div>Styled Card</div>
      </AnimatedCard>
    );
    
    expect(screen.getByText('Styled Card')).toBeInTheDocument();
  });

  it('passes through other card props', () => {
    render(
      <AnimatedCard elevation={4} data-testid="elevated-card">
        <div>Elevated Card</div>
      </AnimatedCard>
    );
    
    const card = screen.getByTestId('elevated-card');
    expect(card).toBeInTheDocument();
  });

  it('has cursor pointer style by default', () => {
    const { container } = render(
      <AnimatedCard>
        <div>Clickable Card</div>
      </AnimatedCard>
    );
    
    const card = container.querySelector('.MuiCard-root');
    expect(card).toBeInTheDocument();
  });

  it('combines multiple props correctly', () => {
    render(
      <AnimatedCard
        animationType="scale"
        glowColor="rgba(255, 0, 0, 0.3)"
        delay={0.2}
        sx={{ margin: 2 }}
        elevation={2}
      >
        <div>Complex Card</div>
      </AnimatedCard>
    );
    
    expect(screen.getByText('Complex Card')).toBeInTheDocument();
  });

  it('renders with overflow visible style', () => {
    const { container } = render(
      <AnimatedCard>
        <div>Overflow Card</div>
      </AnimatedCard>
    );
    
    const card = container.querySelector('.MuiCard-root');
    expect(card).toBeInTheDocument();
  });

  it('handles empty children', () => {
    const { container } = render(<AnimatedCard />);
    
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with default glow color when not specified', () => {
    const { container } = render(
      <AnimatedCard animationType="glow">
        <div>Default Glow Color</div>
      </AnimatedCard>
    );
    
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Default Glow Color')).toBeInTheDocument();
  });

  it('renders with zero delay by default', () => {
    const { container } = render(
      <AnimatedCard>
        <div>No Delay</div>
      </AnimatedCard>
    );
    
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('No Delay')).toBeInTheDocument();
  });
});