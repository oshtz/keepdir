import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  Share as ShareIcon
} from '@mui/icons-material';

interface WorkspaceShareDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * WorkspaceShareDialog - currently disabled as workspace sharing has been removed.
 * This is a portable open-source desktop app that stores data locally.
 * Use the export/import workspace feature instead to share workspace configurations.
 */
const WorkspaceShareDialog: React.FC<WorkspaceShareDialogProps> = ({ open, onClose }) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 1.5,
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{ 
        p: 3, 
        background: 'linear-gradient(135deg, rgba(255,87,51,0.03) 0%, rgba(255,255,255,1) 100%)',
        borderBottom: '1px solid rgba(0,0,0,0.06)'
      }}>
        <Box display="flex" alignItems="center">
          <ShareIcon sx={{ mr: 2, color: 'primary.main' }} />
          <Typography variant="h5" component="div" sx={{ flexGrow: 1, fontWeight: 600, fontFamily: 'var(--font-header)' }}>
            Share Workspace
          </Typography>
          <IconButton 
            onClick={onClose} 
            size="small"
            sx={{ 
              color: 'text.secondary',
              '&:hover': { 
                backgroundColor: 'rgba(0,0,0,0.04)',
                color: 'text.primary'
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 4 }}>
        <Typography variant="body1" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
          Online workspace sharing has been removed from this version.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontFamily: 'var(--font-body)' }}>
          To share your workspace configuration, use the <strong>Export Workspace</strong> feature to save it as a JSON file, 
          then share that file with others who can import it using <strong>Import Workspace</strong>.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button 
          onClick={onClose}
          variant="contained"
          sx={{ 
            fontFamily: 'var(--font-header)',
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkspaceShareDialog;
