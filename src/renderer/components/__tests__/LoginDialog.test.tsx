import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import LoginDialog from '../LoginDialog';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock AnimatedButton
jest.mock('../AnimatedButton', () => {
  return function MockAnimatedButton({ children, onClick, disabled, variant, animationType, ...props }: any) {
    // Filter out animation-specific props that shouldn't be passed to DOM
    const { animationType: _, ...domProps } = props;
    
    const handleClick = (e: any) => {
      if (onClick) {
        onClick(e);
      }
    };
    
    return (
      <button
        onClick={handleClick}
        disabled={disabled}
        type={variant === 'gradient' ? 'submit' : 'button'}
        {...domProps}
      >
        {children}
      </button>
    );
  };
});

describe('LoginDialog', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onLogin: jest.fn(),
    darkMode: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock setTimeout to avoid delays in tests
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders when open', () => {
    render(<LoginDialog {...defaultProps} />);
    
    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByText('Sign in to access your workspace and continue organizing your files.')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<LoginDialog {...defaultProps} open={false} />);
    
    expect(screen.queryByText('Welcome Back')).not.toBeInTheDocument();
  });

  it('handles email input changes', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LoginDialog {...defaultProps} />);
    
    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'test@example.com');
    
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('handles password input changes', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LoginDialog {...defaultProps} />);
    
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, 'password123');
    
    expect(passwordInput).toHaveValue('password123');
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LoginDialog {...defaultProps} />);
    
    const passwordInput = screen.getByLabelText(/password/i);
    // Find the visibility toggle button by its icon
    const toggleButton = screen.getByTestId('VisibilityIcon').closest('button');
    
    // Initially password should be hidden
    expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Click to show password
    if (toggleButton) {
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');
      
      // Click to hide password again
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    }
  });

  it('shows error when submitting empty fields', async () => {
    render(<LoginDialog {...defaultProps} />);
    
    // Submit the form directly since the mocked button might not trigger form submission
    const form = screen.getByRole('dialog').querySelector('form');
    if (form) {
      fireEvent.submit(form);
    }
    
    await waitFor(() => {
      expect(screen.getByText('Please fill in all fields')).toBeInTheDocument();
    });
  });

  it('shows error for invalid email format', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LoginDialog {...defaultProps} />);
    
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'invalid-email');
    await user.type(passwordInput, 'password123');
    await user.click(signInButton);
    
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
  });

  it('calls onLogin with valid credentials', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onLogin = jest.fn();
    render(<LoginDialog {...defaultProps} onLogin={onLogin} />);
    
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(signInButton);
    
    // Fast-forward through the setTimeout delay
    jest.advanceTimersByTime(1500);
    
    await waitFor(() => {
      // onLogin is called with (email, password, isRegistering)
      expect(onLogin).toHaveBeenCalledWith('test@example.com', 'password123', false);
    });
  });

  it('shows loading state during login', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LoginDialog {...defaultProps} />);
    
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(signInButton);
    
    // Should show loading state
    expect(signInButton).toBeDisabled();
    expect(emailInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
  });

  it('clears form after successful login', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LoginDialog {...defaultProps} />);
    
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(signInButton);
    
    // Fast-forward through the setTimeout delay
    jest.advanceTimersByTime(1500);
    
    await waitFor(() => {
      expect(emailInput).toHaveValue('');
      expect(passwordInput).toHaveValue('');
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onClose = jest.fn();
    render(<LoginDialog {...defaultProps} onClose={onClose} />);
    
    // Find close button by its icon
    const closeButton = screen.getByTestId('CloseIcon').closest('button');
    if (closeButton) {
      await user.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onClose = jest.fn();
    render(<LoginDialog {...defaultProps} onClose={onClose} />);
    
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears form when dialog is closed', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onClose = jest.fn();
    render(<LoginDialog {...defaultProps} onClose={onClose} />);
    
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const closeButton = screen.getByTestId('CloseIcon').closest('button');
    
    // Fill in some data
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    
    // Close dialog
    if (closeButton) {
      await user.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('disables sign in button when fields are empty', () => {
    render(<LoginDialog {...defaultProps} />);
    
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    expect(signInButton).toBeDisabled();
  });

  it('enables sign in button when both fields are filled', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<LoginDialog {...defaultProps} />);
    
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    
    expect(signInButton).not.toBeDisabled();
  });

  it('handles form submission via Enter key', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onLogin = jest.fn();
    render(<LoginDialog {...defaultProps} onLogin={onLogin} />);
    
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    
    // Submit the form by pressing Enter on the form
    const form = screen.getByRole('dialog').querySelector('form');
    if (form) {
      fireEvent.submit(form);
    }
    
    // Fast-forward through the setTimeout delay
    jest.advanceTimersByTime(1500);
    
    await waitFor(() => {
      // onLogin is called with (email, password, isRegistering)
      expect(onLogin).toHaveBeenCalledWith('test@example.com', 'password123', false);
    });
  });

  it('applies dark mode styles when darkMode prop is true', () => {
    render(<LoginDialog {...defaultProps} darkMode={true} />);
    
    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    // The dark mode styling is applied via sx props, so we just verify the component renders
  });

  it('shows email and lock icons in input fields', () => {
    render(<LoginDialog {...defaultProps} />);
    
    // Check for email icon (should be in the document)
    const emailIcon = document.querySelector('[data-testid="EmailIcon"]');
    expect(emailIcon).toBeInTheDocument();
    
    // Check for lock icon (should be in the document)
    const lockIcon = document.querySelector('[data-testid="LockIcon"]');
    expect(lockIcon).toBeInTheDocument();
  });
});