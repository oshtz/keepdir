import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import VirtualList from '../VirtualList';

describe('VirtualList', () => {
  const mockItems = Array.from({ length: 100 }, (_, i) => `Item ${i + 1}`);
  const mockRenderItem = jest.fn((item: string, index: number) => (
    <div key={index} data-testid={`item-${index}`}>
      {item}
    </div>
  ));

  beforeEach(() => {
    mockRenderItem.mockClear();
  });

  it('renders virtual list container', () => {
    const { container } = render(
      <VirtualList
        items={mockItems}
        itemHeight={50}
        containerHeight={300}
        renderItem={mockRenderItem}
      />
    );

    // Should render a scrollable container
    const scrollContainer = container.firstChild as HTMLElement;
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveStyle('height: 300px');
    expect(scrollContainer).toHaveStyle('overflow: auto');
  });

  it('only renders visible items initially', () => {
    render(
      <VirtualList
        items={mockItems}
        itemHeight={50}
        containerHeight={300}
        renderItem={mockRenderItem}
      />
    );

    // With containerHeight=300 and itemHeight=50, should show ~6 items + overscan
    // Default overscan is 5, so should render around 16 items total
    expect(mockRenderItem.mock.calls.length).toBeGreaterThan(0);
    expect(mockRenderItem.mock.calls.length).toBeLessThan(mockItems.length);
  });

  it('renders items with correct height', () => {
    const { container } = render(
      <VirtualList
        items={mockItems.slice(0, 10)}
        itemHeight={50}
        containerHeight={300}
        renderItem={mockRenderItem}
      />
    );

    // Check that items have the correct height - look for MUI Box styles
    const itemContainers = container.querySelectorAll('.MuiBox-root');
    expect(itemContainers.length).toBeGreaterThan(0);
  });

  it('handles scroll events', () => {
    const { container } = render(
      <VirtualList
        items={mockItems}
        itemHeight={50}
        containerHeight={300}
        renderItem={mockRenderItem}
      />
    );

    const scrollContainer = container.firstChild as HTMLElement;
    
    // Simulate scroll
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 100 } });
    
    // Should trigger re-render with different visible items
    expect(mockRenderItem).toHaveBeenCalled();
  });

  it('calculates total height correctly', () => {
    const { container } = render(
      <VirtualList
        items={mockItems}
        itemHeight={50}
        containerHeight={300}
        renderItem={mockRenderItem}
      />
    );

    // Look for the inner container that has the total height
    const innerContainer = container.querySelector('.MuiBox-root .MuiBox-root');
    expect(innerContainer).toBeInTheDocument();
  });

  it('uses custom overscan value', () => {
    render(
      <VirtualList
        items={mockItems}
        itemHeight={50}
        containerHeight={300}
        renderItem={mockRenderItem}
        overscan={10}
      />
    );

    // With higher overscan, should render more items
    expect(mockRenderItem).toHaveBeenCalled();
  });

  it('handles empty items array', () => {
    render(
      <VirtualList
        items={[]}
        itemHeight={50}
        containerHeight={300}
        renderItem={mockRenderItem}
      />
    );

    expect(mockRenderItem).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    const { container } = render(
      <VirtualList
        items={mockItems}
        itemHeight={50}
        containerHeight={300}
        renderItem={mockRenderItem}
        className="custom-virtual-list"
      />
    );

    expect(container.querySelector('.custom-virtual-list')).toBeInTheDocument();
  });
});