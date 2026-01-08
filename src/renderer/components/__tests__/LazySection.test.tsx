import React from 'react';
import { render, screen } from '@testing-library/react';
import LazySection from '../LazySection';

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null
});
window.IntersectionObserver = mockIntersectionObserver;

describe('LazySection', () => {
  beforeEach(() => {
    mockIntersectionObserver.mockClear();
  });

  it('renders children immediately when lazy loading is disabled', () => {
    render(
      <LazySection enabled={false}>
        <div data-testid="test-content">Test Content</div>
      </LazySection>
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('renders fallback when lazy loading is enabled and not visible', () => {
    render(
      <LazySection enabled={true}>
        <div data-testid="test-content">Test Content</div>
      </LazySection>
    );

    // Should show skeleton fallback, not the actual content
    expect(screen.queryByTestId('test-content')).not.toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2); // MUI Skeleton has progressbar role
  });

  it('renders custom fallback when provided', () => {
    const customFallback = <div data-testid="custom-fallback">Loading...</div>;
    
    render(
      <LazySection enabled={true} fallback={customFallback}>
        <div data-testid="test-content">Test Content</div>
      </LazySection>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('test-content')).not.toBeInTheDocument();
  });

  it('sets up IntersectionObserver when enabled', () => {
    render(
      <LazySection enabled={true}>
        <div data-testid="test-content">Test Content</div>
      </LazySection>
    );

    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    );
  });

  it('uses custom threshold and rootMargin', () => {
    render(
      <LazySection enabled={true} threshold={0.5} rootMargin="100px">
        <div data-testid="test-content">Test Content</div>
      </LazySection>
    );

    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      {
        threshold: 0.5,
        rootMargin: '100px'
      }
    );
  });
});