import React from 'react';

interface LogoutButtonProps {
  onLogout?: () => void;
}

/**
 * LogoutButton component - currently disabled as authentication has been removed.
 * This is a portable open-source desktop app that doesn't require user authentication.
 */
const LogoutButton: React.FC<LogoutButtonProps> = () => {
  // Authentication removed - this component is now a no-op
  return null;
};

export default LogoutButton;
