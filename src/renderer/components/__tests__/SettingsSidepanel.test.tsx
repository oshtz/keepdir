import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsSidepanel from '../SettingsSidepanel';

describe('SettingsSidepanel', () => {
  const mockTabs = [
    { id: 'general', label: 'General', icon: null },
    { id: 'themes', label: 'Workspace Themes', icon: null },
    { id: 'workspace', label: 'Workspace', icon: null },
    { id: 'sections', label: 'Custom Sections', icon: null },
    { id: 'history', label: 'Operation History', icon: null },
    { id: 'airules', label: 'AI Rules & Presets', icon: null },
    { id: 'providers', label: 'AI Providers', icon: null },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: null },
    { id: 'about', label: 'About & Updates', icon: null }
  ];

  const defaultProps = {
    tabs: mockTabs,
    activeTab: 'general',
    onTabChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all tabs', () => {
    render(<SettingsSidepanel {...defaultProps} />);
    
    mockTabs.forEach(tab => {
      expect(screen.getByText(tab.label)).toBeInTheDocument();
    });
  });

  it('should render as a plain settings navigation surface', () => {
    render(<SettingsSidepanel {...defaultProps} />);

    expect(screen.getByTestId('settings-sidepanel')).toHaveAttribute('data-surface', 'plain-nav');
  });

  it('should highlight active tab', () => {
    render(<SettingsSidepanel {...defaultProps} activeTab="providers" />);
    
    const providersTab = screen.getByText('AI Providers').closest('[role="button"]');
    expect(providersTab).toHaveClass('Mui-selected');
  });

  it('should call onTabChange when tab is clicked', () => {
    const onTabChange = jest.fn();
    render(<SettingsSidepanel {...defaultProps} onTabChange={onTabChange} />);
    
    const workspaceTab = screen.getByText('Workspace');
    fireEvent.click(workspaceTab);
    
    expect(onTabChange).toHaveBeenCalledWith('workspace');
  });

  it('should render with custom tabs', () => {
    const customTabs = [
      { id: 'custom1', label: 'Custom Tab 1', icon: null },
      { id: 'custom2', label: 'Custom Tab 2', icon: null },
    ];

    render(<SettingsSidepanel {...defaultProps} tabs={customTabs} />);
    
    expect(screen.getByText('Custom Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Custom Tab 2')).toBeInTheDocument();
  });

  it('should handle empty tabs array', () => {
    render(<SettingsSidepanel {...defaultProps} tabs={[]} />);
    
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('should apply correct styling for selected tab', () => {
    render(<SettingsSidepanel {...defaultProps} activeTab="themes" />);
    
    const themesTab = screen.getByText('Workspace Themes').closest('[role="button"]');
    expect(themesTab).toHaveClass('Mui-selected');
    
    const generalTab = screen.getByText('General').closest('[role="button"]');
    expect(generalTab).not.toHaveClass('Mui-selected');
  });

  it('should handle tab change for all tabs', () => {
    const onTabChange = jest.fn();
    render(<SettingsSidepanel {...defaultProps} onTabChange={onTabChange} />);
    
    mockTabs.forEach(tab => {
      const tabElement = screen.getByText(tab.label);
      fireEvent.click(tabElement);
      expect(onTabChange).toHaveBeenCalledWith(tab.id);
    });
    
    expect(onTabChange).toHaveBeenCalledTimes(mockTabs.length);
  });

  it('should render with proper accessibility attributes', () => {
    render(<SettingsSidepanel {...defaultProps} />);
    
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(mockTabs.length);
    
    buttons.forEach(button => {
      expect(button).toBeInTheDocument();
    });
  });

  it('should handle activeTab that does not exist in tabs', () => {
    render(<SettingsSidepanel {...defaultProps} activeTab="nonexistent" />);
    
    // Should not crash and should render all tabs
    mockTabs.forEach(tab => {
      expect(screen.getByText(tab.label)).toBeInTheDocument();
    });
    
    // No tab should be selected
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).not.toHaveClass('Mui-selected');
    });
  });

  it('should use the merged default appearance tabs when tabs are omitted', () => {
    render(
      <SettingsSidepanel
        activeTab="general"
        onTabChange={jest.fn()}
      />
    );
    
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.queryByText('Workspace Themes')).not.toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Custom Sections')).toBeInTheDocument();
    expect(screen.getByText('AI Providers')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });
});
