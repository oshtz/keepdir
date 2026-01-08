import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useContextMenu } from '../useContextMenu';

describe('useContextMenu', () => {
  let mockEvent: React.MouseEvent;

  beforeEach(() => {
    mockEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      clientX: 100,
      clientY: 200,
    } as unknown as React.MouseEvent;

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 768,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with closed context menu', () => {
    const { result } = renderHook(() => useContextMenu());

    expect(result.current.contextMenu.isOpen).toBe(false);
    expect(result.current.contextMenu.position).toEqual({ x: 0, y: 0 });
    expect(result.current.contextMenu.items).toEqual([]);
  });

  it('should show context menu with correct position and items', () => {
    const { result } = renderHook(() => useContextMenu());
    const items = [
      { id: '1', label: 'Item 1', onClick: jest.fn() },
      { id: '2', label: 'Item 2', onClick: jest.fn() },
    ];

    act(() => {
      result.current.showContextMenu(mockEvent, items);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(result.current.contextMenu.isOpen).toBe(true);
    expect(result.current.contextMenu.position).toEqual({ x: 100, y: 200 });
    expect(result.current.contextMenu.items).toEqual(items);
  });

  it('should adjust position when menu would overflow viewport', () => {
    const { result } = renderHook(() => useContextMenu());
    const items = [
      { id: '1', label: 'Item 1', onClick: jest.fn() },
      { id: '2', label: 'Item 2', onClick: jest.fn() },
    ];

    // Position near right edge
    const edgeEvent = {
      ...mockEvent,
      clientX: 900,
      clientY: 700,
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.showContextMenu(edgeEvent, items);
    });

    expect(result.current.contextMenu.position.x).toBeLessThan(900);
    expect(result.current.contextMenu.position.y).toBeLessThan(700);
  });

  it('should hide context menu', () => {
    const { result } = renderHook(() => useContextMenu());
    const items = [{ id: '1', label: 'Item 1', onClick: jest.fn() }];

    act(() => {
      result.current.showContextMenu(mockEvent, items);
    });

    expect(result.current.contextMenu.isOpen).toBe(true);

    act(() => {
      result.current.hideContextMenu();
    });

    expect(result.current.contextMenu.isOpen).toBe(false);
  });

  it('should handle item click for enabled items', () => {
    const { result } = renderHook(() => useContextMenu());
    const mockOnClick = jest.fn();
    const items = [
      { id: '1', label: 'Item 1', onClick: mockOnClick },
    ];

    act(() => {
      result.current.showContextMenu(mockEvent, items);
    });

    act(() => {
      result.current.handleItemClick(items[0]);
    });

    expect(mockOnClick).toHaveBeenCalled();
    expect(result.current.contextMenu.isOpen).toBe(false);
  });

  it('should not handle item click for disabled items', () => {
    const { result } = renderHook(() => useContextMenu());
    const mockOnClick = jest.fn();
    const items = [
      { id: '1', label: 'Item 1', onClick: mockOnClick, disabled: true },
    ];

    act(() => {
      result.current.showContextMenu(mockEvent, items);
    });

    act(() => {
      result.current.handleItemClick(items[0]);
    });

    expect(mockOnClick).not.toHaveBeenCalled();
    expect(result.current.contextMenu.isOpen).toBe(false);
  });

  it('should close context menu on outside click', () => {
    const { result } = renderHook(() => useContextMenu());
    const items = [{ id: '1', label: 'Item 1', onClick: jest.fn() }];

    act(() => {
      result.current.showContextMenu(mockEvent, items);
    });

    expect(result.current.contextMenu.isOpen).toBe(true);

    // Simulate outside click
    act(() => {
      document.dispatchEvent(new Event('click'));
    });

    expect(result.current.contextMenu.isOpen).toBe(false);
  });

  it('should close context menu on escape key', () => {
    const { result } = renderHook(() => useContextMenu());
    const items = [{ id: '1', label: 'Item 1', onClick: jest.fn() }];

    act(() => {
      result.current.showContextMenu(mockEvent, items);
    });

    expect(result.current.contextMenu.isOpen).toBe(true);

    // Simulate escape key
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.contextMenu.isOpen).toBe(false);
  });

  it('should handle items with dividers and shortcuts', () => {
    const { result } = renderHook(() => useContextMenu());
    const items = [
      { id: '1', label: 'Item 1', onClick: jest.fn(), shortcut: 'Ctrl+C' },
      { id: '2', label: 'Item 2', onClick: jest.fn(), divider: true },
      { id: '3', label: 'Item 3', onClick: jest.fn(), icon: <span>icon</span> },
    ];

    act(() => {
      result.current.showContextMenu(mockEvent, items);
    });

    expect(result.current.contextMenu.items).toEqual(items);
    expect(result.current.contextMenu.items[0].shortcut).toBe('Ctrl+C');
    expect(result.current.contextMenu.items[1].divider).toBe(true);
    expect(result.current.contextMenu.items[2].icon).toBeDefined();
  });
});