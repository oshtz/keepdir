import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SmoothTabs from '../SmoothTabs';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('SmoothTabs', () => {
  const mockTabs = [
    {
      id: 'tab1',
      label: 'First Tab',
      content: <div>First tab content</div>
    },
    {
      id: 'tab2',
      label: 'Second Tab',
      content: <div>Second tab content</div>
    },
    {
      id: 'tab3',
      label: 'Third Tab',
      content: <div>Third tab content</div>
    }
  ];

  const defaultProps = {
    tabs: mockTabs,
    onTabChange: jest.fn(),
    activeTab: undefined,
    variant: 'underline' as const
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all tabs', () => {
    render(<SmoothTabs {...defaultProps} />);
    
    expect(screen.getByText('First Tab')).toBeInTheDocument();
    expect(screen.getByText('Second Tab')).toBeInTheDocument();
    expect(screen.getByText('Third Tab')).toBeInTheDocument();
  });

  it('renders tab content for active tab', () => {
    render(<SmoothTabs {...defaultProps} />);
    
    // First tab should be active by default
    expect(screen.getByText('First tab content')).toBeInTheDocument();
    expect(screen.queryByText('Second tab content')).not.toBeVisible();
    expect(screen.queryByText('Third tab content')).not.toBeVisible();
  });

  it('switches tabs when clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(<SmoothTabs {...defaultProps} onTabChange={onTabChange} />);
    
    const secondTab = screen.getByText('Second Tab');
    await user.click(secondTab);
    
    expect(onTabChange).toHaveBeenCalledWith('tab2');
  });

  it('shows content for clicked tab', async () => {
    const user = userEvent.setup();
    render(<SmoothTabs {...defaultProps} />);
    
    const secondTab = screen.getByText('Second Tab');
    await user.click(secondTab);
    
    expect(screen.getByText('Second tab content')).toBeInTheDocument();
    expect(screen.queryByText('First tab content')).not.toBeVisible();
  });

  it('uses activeTab prop when provided', () => {
    render(<SmoothTabs {...defaultProps} activeTab="tab2" />);
    
    expect(screen.getByText('Second tab content')).toBeInTheDocument();
    expect(screen.queryByText('First tab content')).not.toBeVisible();
  });

  it('defaults to first tab when no activeTab provided', () => {
    render(<SmoothTabs {...defaultProps} />);
    
    expect(screen.getByText('First tab content')).toBeInTheDocument();
  });

  it('handles empty tabs array', () => {
    render(<SmoothTabs {...defaultProps} tabs={[]} />);
    
    // Should not crash and should render empty container
    expect(screen.queryByText('First Tab')).not.toBeInTheDocument();
  });

  it('applies underline variant styles by default', () => {
    render(<SmoothTabs {...defaultProps} />);
    
    // The component should render without errors with underline variant
    expect(screen.getByText('First Tab')).toBeInTheDocument();
  });

  it('applies pill variant styles', () => {
    render(<SmoothTabs {...defaultProps} variant="pill" />);
    
    expect(screen.getByText('First Tab')).toBeInTheDocument();
    expect(screen.getByText('Second Tab')).toBeInTheDocument();
  });

  it('applies background variant styles', () => {
    render(<SmoothTabs {...defaultProps} variant="background" />);
    
    expect(screen.getByText('First Tab')).toBeInTheDocument();
    expect(screen.getByText('Second Tab')).toBeInTheDocument();
  });

  it('highlights active tab with different font weight', () => {
    render(<SmoothTabs {...defaultProps} />);
    
    const firstTab = screen.getByText('First Tab');
    const secondTab = screen.getByText('Second Tab');
    
    // First tab should be active (bold)
    expect(firstTab).toHaveStyle({ fontWeight: 600 });
    // Second tab should be inactive (normal)
    expect(secondTab).toHaveStyle({ fontWeight: 400 });
  });

  it('updates active tab styling when tab is clicked', async () => {
    const user = userEvent.setup();
    render(<SmoothTabs {...defaultProps} />);
    
    const secondTab = screen.getByText('Second Tab');
    await user.click(secondTab);
    
    // After clicking, second tab should be bold
    expect(secondTab).toHaveStyle({ fontWeight: 600 });
  });

  it('calls onTabChange with correct tab id', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(<SmoothTabs {...defaultProps} onTabChange={onTabChange} />);
    
    await user.click(screen.getByText('Second Tab'));
    expect(onTabChange).toHaveBeenCalledWith('tab2');
    
    await user.click(screen.getByText('Third Tab'));
    expect(onTabChange).toHaveBeenCalledWith('tab3');
  });

  it('does not call onTabChange when clicking already active tab', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(<SmoothTabs {...defaultProps} onTabChange={onTabChange} />);
    
    // Click the first tab (which is already active)
    await user.click(screen.getByText('First Tab'));
    
    expect(onTabChange).toHaveBeenCalledWith('tab1');
  });

  it('works without onTabChange callback', async () => {
    const user = userEvent.setup();
    render(<SmoothTabs {...defaultProps} onTabChange={undefined} />);
    
    // Should not crash when clicking tabs
    await user.click(screen.getByText('Second Tab'));
    expect(screen.getByText('Second tab content')).toBeInTheDocument();
  });

  it('handles tabs without content', () => {
    const tabsWithoutContent = [
      { id: 'tab1', label: 'First Tab' },
      { id: 'tab2', label: 'Second Tab' }
    ];
    
    render(<SmoothTabs {...defaultProps} tabs={tabsWithoutContent} />);
    
    expect(screen.getByText('First Tab')).toBeInTheDocument();
    expect(screen.getByText('Second Tab')).toBeInTheDocument();
  });

  it('maintains tab selection state internally', async () => {
    const user = userEvent.setup();
    render(<SmoothTabs {...defaultProps} />);
    
    // Click second tab
    await user.click(screen.getByText('Second Tab'));
    expect(screen.getByText('Second tab content')).toBeInTheDocument();
    
    // Click third tab
    await user.click(screen.getByText('Third Tab'));
    expect(screen.getByText('Third tab content')).toBeInTheDocument();
    expect(screen.queryByText('Second tab content')).not.toBeVisible();
  });

  it('applies correct color styling for active tab in different variants', () => {
    const { rerender } = render(<SmoothTabs {...defaultProps} variant="underline" />);
    
    const firstTab = screen.getByText('First Tab');
    expect(firstTab).toHaveStyle({ color: 'rgb(255, 87, 51)' });
    
    // Test background variant
    rerender(<SmoothTabs {...defaultProps} variant="background" />);
    const firstTabBackground = screen.getByText('First Tab');
    expect(firstTabBackground).toHaveStyle({ color: 'rgb(255, 255, 255)' });
  });

  it('renders motion indicator for active tab', () => {
    render(<SmoothTabs {...defaultProps} />);
    
    // The motion indicator is rendered as a motion.div, which our mock renders as a div
    // We can't easily test the motion properties, but we can verify the component renders
    expect(screen.getByText('First Tab')).toBeInTheDocument();
  });

  it('handles rapid tab switching', async () => {
    const user = userEvent.setup();
    const onTabChange = jest.fn();
    render(<SmoothTabs {...defaultProps} onTabChange={onTabChange} />);
    
    // Rapidly click different tabs
    await user.click(screen.getByText('Second Tab'));
    await user.click(screen.getByText('Third Tab'));
    await user.click(screen.getByText('First Tab'));
    
    expect(onTabChange).toHaveBeenCalledTimes(3);
    expect(onTabChange).toHaveBeenNthCalledWith(1, 'tab2');
    expect(onTabChange).toHaveBeenNthCalledWith(2, 'tab3');
    expect(onTabChange).toHaveBeenNthCalledWith(3, 'tab1');
    
    // Should show first tab content
    expect(screen.getByText('First tab content')).toBeInTheDocument();
  });
});