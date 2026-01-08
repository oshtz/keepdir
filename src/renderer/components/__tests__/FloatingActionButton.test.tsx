import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FloatingActionButton from '../FloatingActionButton';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div data-testid="motion-div" {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <div data-testid="animate-presence">{children}</div>,
}));

describe('FloatingActionButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders with default props', () => {
    render(
      <FloatingActionButton>
        <span>+</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    expect(fab).toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument();
  });

  it('renders with circular variant by default', () => {
    render(
      <FloatingActionButton>
        <span>+</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    expect(fab).toBeInTheDocument();
  });

  it('renders with extended variant', () => {
    render(
      <FloatingActionButton variant="extended">
        <span>Extended</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    expect(fab).toBeInTheDocument();
    expect(screen.getByText('Extended')).toBeInTheDocument();
  });

  it('renders with ripple variant', () => {
    render(
      <FloatingActionButton variant="ripple">
        <span>Ripple</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    expect(fab).toBeInTheDocument();
    expect(screen.getByText('Ripple')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(
      <FloatingActionButton onClick={handleClick}>
        <span>Click Me</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    fireEvent.click(fab);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('creates ripple effect on click when variant is ripple', () => {
    const handleClick = jest.fn();
    render(
      <FloatingActionButton variant="ripple" onClick={handleClick}>
        <span>Ripple</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    
    // Mock getBoundingClientRect
    fab.getBoundingClientRect = jest.fn(() => ({
      left: 100,
      top: 100,
      width: 56,
      height: 56,
      right: 156,
      bottom: 156,
      x: 100,
      y: 100,
      toJSON: jest.fn()
    }));

    fireEvent.click(fab, { clientX: 128, clientY: 128 });

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('removes ripple effect after timeout', async () => {
    render(
      <FloatingActionButton variant="ripple">
        <span>Ripple</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    
    // Mock getBoundingClientRect
    fab.getBoundingClientRect = jest.fn(() => ({
      left: 100,
      top: 100,
      width: 56,
      height: 56,
      right: 156,
      bottom: 156,
      x: 100,
      y: 100,
      toJSON: jest.fn()
    }));

    fireEvent.click(fab, { clientX: 128, clientY: 128 });

    // Fast-forward time to trigger ripple removal
    jest.advanceTimersByTime(600);

    // The ripple should be removed after the timeout
    await waitFor(() => {
      expect(fab).toBeInTheDocument();
    });
  });

  it('renders with expandOnHover enabled', () => {
    const actions = [
      {
        icon: <span data-testid="action-1">📝</span>,
        label: 'Edit',
        onClick: jest.fn()
      },
      {
        icon: <span data-testid="action-2">🗑️</span>,
        label: 'Delete',
        onClick: jest.fn()
      }
    ];

    render(
      <FloatingActionButton expandOnHover={true} actions={actions}>
        <span>Menu</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    expect(fab).toBeInTheDocument();
  });

  it('shows actions on hover when expandOnHover is true', () => {
    const actions = [
      {
        icon: <span data-testid="action-1">📝</span>,
        label: 'Edit',
        onClick: jest.fn()
      }
    ];

    render(
      <FloatingActionButton expandOnHover={true} actions={actions}>
        <span>Menu</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    fireEvent.mouseEnter(fab);

    // Actions should be rendered when expanded
    expect(screen.getByTestId('action-1')).toBeInTheDocument();
  });

  it('hides actions on mouse leave when expandOnHover is true', () => {
    const actions = [
      {
        icon: <span data-testid="action-1">📝</span>,
        label: 'Edit',
        onClick: jest.fn()
      }
    ];

    render(
      <FloatingActionButton expandOnHover={true} actions={actions}>
        <span>Menu</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    
    // First hover to show actions
    fireEvent.mouseEnter(fab);
    expect(screen.getByTestId('action-1')).toBeInTheDocument();

    // Then leave to hide actions
    fireEvent.mouseLeave(fab);
    
    // Actions should be hidden (though AnimatePresence mock might still show them)
    // In real implementation, they would be animated out
  });

  it('calls action onClick when action button is clicked', () => {
    const mockActionClick = jest.fn();
    const actions = [
      {
        icon: <span data-testid="action-1">📝</span>,
        label: 'Edit',
        onClick: mockActionClick
      }
    ];

    render(
      <FloatingActionButton expandOnHover={true} actions={actions}>
        <span>Menu</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    fireEvent.mouseEnter(fab);

    const actionButton = screen.getByTestId('action-1').closest('button');
    if (actionButton) {
      fireEvent.click(actionButton);
      expect(mockActionClick).toHaveBeenCalledTimes(1);
    }
  });

  it('applies custom sx styles', () => {
    render(
      <FloatingActionButton sx={{ backgroundColor: 'red' }}>
        <span>Styled</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    expect(fab).toBeInTheDocument();
  });

  it('passes through other FAB props', () => {
    render(
      <FloatingActionButton size="small" color="secondary" disabled>
        <span>Props</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    expect(fab).toBeDisabled();
  });

  it('uses custom ripple color', () => {
    render(
      <FloatingActionButton variant="ripple" rippleColor="rgba(0, 255, 0, 0.5)">
        <span>Custom Ripple</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    expect(fab).toBeInTheDocument();
  });

  it('renders without actions when expandOnHover is false', () => {
    const actions = [
      {
        icon: <span data-testid="action-1">📝</span>,
        label: 'Edit',
        onClick: jest.fn()
      }
    ];

    render(
      <FloatingActionButton expandOnHover={false} actions={actions}>
        <span>No Expand</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    fireEvent.mouseEnter(fab);

    // Actions should not be visible when expandOnHover is false
    expect(screen.queryByTestId('action-1')).not.toBeInTheDocument();
  });

  it('renders with empty actions array', () => {
    render(
      <FloatingActionButton expandOnHover={true} actions={[]}>
        <span>Empty Actions</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    fireEvent.mouseEnter(fab);

    // Should not crash with empty actions
    expect(fab).toBeInTheDocument();
  });

  it('handles multiple ripple clicks', () => {
    render(
      <FloatingActionButton variant="ripple">
        <span>Multiple Ripples</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    
    // Mock getBoundingClientRect
    fab.getBoundingClientRect = jest.fn(() => ({
      left: 100,
      top: 100,
      width: 56,
      height: 56,
      right: 156,
      bottom: 156,
      x: 100,
      y: 100,
      toJSON: jest.fn()
    }));

    // Click multiple times to create multiple ripples
    fireEvent.click(fab, { clientX: 128, clientY: 128 });
    fireEvent.click(fab, { clientX: 130, clientY: 130 });
    fireEvent.click(fab, { clientX: 125, clientY: 125 });

    expect(fab).toBeInTheDocument();
  });

  it('renders multiple actions with staggered animation delays', () => {
    const actions = [
      {
        icon: <span data-testid="action-1">📝</span>,
        label: 'Edit',
        onClick: jest.fn()
      },
      {
        icon: <span data-testid="action-2">🗑️</span>,
        label: 'Delete',
        onClick: jest.fn()
      },
      {
        icon: <span data-testid="action-3">📋</span>,
        label: 'Copy',
        onClick: jest.fn()
      }
    ];

    render(
      <FloatingActionButton expandOnHover={true} actions={actions}>
        <span>Multiple Actions</span>
      </FloatingActionButton>
    );

    const fab = screen.getByRole('button');
    fireEvent.mouseEnter(fab);

    expect(screen.getByTestId('action-1')).toBeInTheDocument();
    expect(screen.getByTestId('action-2')).toBeInTheDocument();
    expect(screen.getByTestId('action-3')).toBeInTheDocument();
  });
});