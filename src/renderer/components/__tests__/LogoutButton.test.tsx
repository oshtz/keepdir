import React from 'react';
import { render } from '@testing-library/react';
import LogoutButton from '../LogoutButton';

describe('LogoutButton', () => {
  it('renders nothing (component disabled since auth was removed)', () => {
    const { container } = render(<LogoutButton />);
    expect(container.firstChild).toBeNull();
  });

  it('accepts onLogout prop without error', () => {
    const mockOnLogout = jest.fn();
    const { container } = render(<LogoutButton onLogout={mockOnLogout} />);
    expect(container.firstChild).toBeNull();
  });
});
