import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert, { AlertColor } from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Slide, { SlideProps } from '@mui/material/Slide';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Button from '@mui/material/Button';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  title?: string;
  severity: AlertColor;
  duration?: number;
  action?: ToastAction;
  progress?: number;
  persistent?: boolean;
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => string;
  showSuccess: (message: string, title?: string, action?: ToastAction) => string;
  showError: (message: string, title?: string, action?: ToastAction) => string;
  showWarning: (message: string, title?: string, action?: ToastAction) => string;
  showInfo: (message: string, title?: string, action?: ToastAction) => string;
  updateToast: (id: string, updates: Partial<Omit<Toast, 'id'>>) => void;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const SlideTransition = (props: SlideProps) => {
  return <Slide {...props} direction="up" />;
};

const DEFAULT_DURATION = 5000;
const MAX_TOASTS = 5;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const showToast = useCallback((toast: Omit<Toast, 'id'>): string => {
    const id = generateId();
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.persistent ? undefined : (toast.duration ?? DEFAULT_DURATION)
    };

    setToasts(prev => {
      // Limit number of toasts
      const updated = [...prev, newToast];
      if (updated.length > MAX_TOASTS) {
        return updated.slice(-MAX_TOASTS);
      }
      return updated;
    });

    return id;
  }, []);

  const showSuccess = useCallback((message: string, title?: string, action?: ToastAction): string => {
    return showToast({ message, title, severity: 'success', action });
  }, [showToast]);

  const showError = useCallback((message: string, title?: string, action?: ToastAction): string => {
    return showToast({ message, title, severity: 'error', action, duration: 8000 });
  }, [showToast]);

  const showWarning = useCallback((message: string, title?: string, action?: ToastAction): string => {
    return showToast({ message, title, severity: 'warning', action });
  }, [showToast]);

  const showInfo = useCallback((message: string, title?: string, action?: ToastAction): string => {
    return showToast({ message, title, severity: 'info', action });
  }, [showToast]);

  const updateToast = useCallback((id: string, updates: Partial<Omit<Toast, 'id'>>) => {
    setToasts(prev => prev.map(toast => 
      toast.id === id ? { ...toast, ...updates } : toast
    ));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        updateToast,
        dismissToast,
        dismissAll
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        maxWidth: 400,
        width: '100%',
        pointerEvents: 'none',
        '& > *': {
          pointerEvents: 'auto'
        }
      }}
    >
      {toasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
          index={index}
        />
      ))}
    </Box>
  );
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
  index: number;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss, index: _index }) => {
  void _index; // Suppress unused warning
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (toast.duration && !toast.persistent) {
      const timer = setTimeout(() => {
        setOpen(false);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toast.duration, toast.persistent]);

  const handleClose = (_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  const handleExited = () => {
    onDismiss();
  };

  return (
    <Snackbar
      open={open}
      onClose={handleClose}
      TransitionComponent={SlideTransition}
      TransitionProps={{ onExited: handleExited }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      sx={{
        position: 'relative',
        transform: 'none !important',
        bottom: 'auto !important',
        right: 'auto !important',
        left: 'auto !important',
        top: 'auto !important',
        width: '100%'
      }}
    >
      <Alert
        severity={toast.severity}
        onClose={handleClose}
        variant="filled"
        sx={{
          width: '100%',
          borderRadius: 1.5,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          '& .MuiAlert-message': {
            width: '100%',
            fontFamily: 'var(--font-body)'
          },
          '& .MuiAlert-action': {
            alignItems: 'flex-start',
            pt: 0.5
          }
        }}
        action={
          <>
            {toast.action && (
              <Button
                color="inherit"
                size="small"
                onClick={toast.action.onClick}
                sx={{
                  fontFamily: 'var(--font-header)',
                  fontWeight: 600,
                  mr: 1
                }}
              >
                {toast.action.label}
              </Button>
            )}
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleClose}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        }
      >
        {toast.title && (
          <AlertTitle sx={{ fontFamily: 'var(--font-header)', fontWeight: 600 }}>
            {toast.title}
          </AlertTitle>
        )}
        <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
          {toast.message}
        </Typography>
        {toast.progress !== undefined && (
          <Box sx={{ width: '100%', mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={toast.progress}
              sx={{
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(255,255,255,0.3)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.9)'
                }
              }}
            />
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                textAlign: 'right',
                mt: 0.5,
                opacity: 0.9
              }}
            >
              {Math.round(toast.progress)}%
            </Typography>
          </Box>
        )}
      </Alert>
    </Snackbar>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastProvider;
