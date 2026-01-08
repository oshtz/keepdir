import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Box,
  Typography,
  Divider,
  IconButton,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Email as EmailIcon,
  Lock as LockIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import AnimatedButton from './AnimatedButton';

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string, isRegistering: boolean) => void;
  darkMode?: boolean;
}

const LoginDialog: React.FC<LoginDialogProps> = ({ open, onClose, onLogin, darkMode = false }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // In a real app, validate credentials and call onLogin
      await onLogin(email, password, isRegistering);

      // Clear form
      setEmail('');
      setPassword('');
      setError('');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setError('');
    setIsRegistering(false); // Reset registration state on close
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 1.5,
          overflow: 'visible',
          background: darkMode
            ? 'linear-gradient(135deg, rgba(45,45,45,0.95) 0%, rgba(30,30,30,0.95) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,249,250,0.95) 100%)',
          backdropFilter: 'blur(20px)',
          border: darkMode
            ? '1px solid rgba(255,255,255,0.1)'
            : '1px solid rgba(255,255,255,0.2)',
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <DialogTitle sx={{
          fontFamily: 'var(--font-header)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <motion.div
              initial={{ rotate: -10 }}
              animate={{ rotate: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <Typography variant="h5" sx={{ fontFamily: 'var(--font-header)', fontWeight: 600 }}>
                {isRegistering ? 'Create Account' : 'Welcome Back'}
              </Typography>
            </motion.div>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <Divider sx={{ mx: 3 }} />

        <DialogContent sx={{ pt: 3 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 3, fontFamily: 'var(--font-body)' }}
          >
            {isRegistering
              ? 'Create an account to start organizing your files securely.'
              : 'Sign in to access your workspace and continue organizing your files.'}
          </Typography>

          <Box component="form" onSubmit={handleSubmit}>
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>
                    {error}
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <TextField
                autoFocus
                margin="dense"
                label="Email Address"
                type="email"
                fullWidth
                variant="outlined"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                InputProps={{
                  startAdornment: <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    },
                    '&.Mui-focused': {
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 12px rgba(255,87,51,0.2)',
                    }
                  }
                }}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              <TextField
                margin="dense"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                InputProps={{
                  startAdornment: <LockIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                  endAdornment: (
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  ),
                }}
                sx={{
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    },
                    '&.Mui-focused': {
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 12px rgba(255,87,51,0.2)',
                    }
                  }
                }}
              />
            </motion.div>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <AnimatedButton
            onClick={handleClose}
            variant="outlined"
            animationType="scale"
            disabled={isLoading}
            sx={{ minWidth: 100 }}
          >
            Cancel
          </AnimatedButton>
          <AnimatedButton
            onClick={handleSubmit}
            variant="gradient"
            animationType="glow"
            disabled={isLoading || !email || !password}
            sx={{ minWidth: 120 }}
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                ⟳
              </motion.div>
            ) : (
              isRegistering ? 'Sign Up' : 'Sign In'
            )}
          </AnimatedButton>
        </DialogActions>

        <Box sx={{ px: 3, pb: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
            <Button
              size="small"
              onClick={() => setIsRegistering(!isRegistering)}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {isRegistering ? 'Sign In' : 'Create Account'}
            </Button>
          </Typography>
        </Box>

      </motion.div>
    </Dialog>
  );
};

export default LoginDialog;