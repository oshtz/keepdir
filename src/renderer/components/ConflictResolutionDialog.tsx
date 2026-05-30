import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import MergeIcon from '@mui/icons-material/Merge';
import TextField from '@mui/material/TextField';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import Checkbox from '@mui/material/Checkbox';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderIcon from '@mui/icons-material/Folder';

export type ConflictResolution = 'rename' | 'skip' | 'auto_increment' | 'merge' | 'overwrite';

export interface FileConflict {
  id: string;
  sourcePath: string;
  targetPath: string;
  sourceName: string;
  targetName: string;
  isDirectory: boolean;
  existingFileSize?: number;
  newFileSize?: number;
  existingModified?: Date;
  newModified?: Date;
}

export interface ConflictResult {
  conflictId: string;
  resolution: ConflictResolution;
  newName?: string;
}

interface ConflictResolutionDialogProps {
  open: boolean;
  onClose: () => void;
  conflicts: FileConflict[];
  onResolve: (results: ConflictResult[]) => void;
  onResolveAll: (resolution: ConflictResolution) => void;
}

const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  open,
  onClose,
  conflicts,
  onResolve,
  onResolveAll
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<string, ConflictResult>>(new Map());
  const [selectedResolution, setSelectedResolution] = useState<ConflictResolution>('auto_increment');
  const [customName, setCustomName] = useState('');
  const [applyToAll, setApplyToAll] = useState(false);

  const currentConflict = conflicts[currentIndex];
  const totalConflicts = conflicts.length;

  const handleResolutionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedResolution(event.target.value as ConflictResolution);
  };

  const generateAutoIncrementName = (name: string): string => {
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return `${name} (1)`;
    }
    const baseName = name.substring(0, lastDotIndex);
    const extension = name.substring(lastDotIndex);
    return `${baseName} (1)${extension}`;
  };

  const handleApplyResolution = () => {
    if (!currentConflict) return;

    const result: ConflictResult = {
      conflictId: currentConflict.id,
      resolution: selectedResolution,
      newName: selectedResolution === 'rename' 
        ? customName 
        : selectedResolution === 'auto_increment'
          ? generateAutoIncrementName(currentConflict.targetName)
          : undefined
    };

    if (applyToAll) {
      // Apply same resolution to all remaining conflicts
      const allResults: ConflictResult[] = conflicts.slice(currentIndex).map(conflict => ({
        conflictId: conflict.id,
        resolution: selectedResolution,
        newName: selectedResolution === 'rename'
          ? customName
          : selectedResolution === 'auto_increment'
            ? generateAutoIncrementName(conflict.targetName)
            : undefined
      }));
      
      onResolve([...Array.from(resolutions.values()), ...allResults]);
      onClose();
      return;
    }

    const newResolutions = new Map(resolutions);
    newResolutions.set(currentConflict.id, result);
    setResolutions(newResolutions);

    if (currentIndex < totalConflicts - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedResolution('auto_increment');
      setCustomName('');
    } else {
      // All conflicts resolved
      onResolve(Array.from(newResolutions.values()));
      onClose();
    }
  };

  const handleSkipAll = () => {
    onResolveAll('skip');
    onClose();
  };

  const handleAutoIncrementAll = () => {
    onResolveAll('auto_increment');
    onClose();
  };

  const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (date?: Date): string => {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleString();
  };

  if (!currentConflict) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        tabIndex: -1,
        sx: {
          borderRadius: 1.5,
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle
        sx={{
          p: 2,
          background: 'linear-gradient(135deg, rgba(255,152,0,0.1) 0%, rgba(255,255,255,1) 100%)',
          borderBottom: '1px solid rgba(0,0,0,0.06)'
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <WarningAmberIcon color="warning" />
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              fontFamily: 'var(--font-header)'
            }}
          >
            File Conflict Detected
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'var(--font-body)' }}
          >
            {currentIndex + 1} of {totalConflicts}
          </Typography>
          <IconButton
            onClick={onClose}
            size="small"
            aria-label="close"
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

      <DialogContent sx={{ p: 3 }}>
        {/* Conflict Details */}
        <Box
          sx={{
            p: 2,
            backgroundColor: 'warning.light',
            borderRadius: 1.5,
            mb: 3,
            border: '1px solid',
            borderColor: 'warning.main'
          }}
        >
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            {currentConflict.isDirectory ? (
              <FolderIcon color="warning" />
            ) : (
              <InsertDriveFileIcon color="warning" />
            )}
            <Typography
              variant="subtitle1"
              sx={{ fontFamily: 'var(--font-header)', fontWeight: 600 }}
            >
              {currentConflict.targetName}
            </Typography>
          </Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'var(--font-body)', mb: 2 }}
          >
            A {currentConflict.isDirectory ? 'folder' : 'file'} with this name already exists at the destination.
          </Typography>
          
          <Box display="flex" gap={3} flexWrap="wrap">
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                Existing File
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                Size: {formatFileSize(currentConflict.existingFileSize)}
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                Modified: {formatDate(currentConflict.existingModified)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                New File
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                Size: {formatFileSize(currentConflict.newFileSize)}
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                Modified: {formatDate(currentConflict.newModified)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Resolution Options */}
        <Typography
          variant="subtitle1"
          sx={{ mb: 2, fontFamily: 'var(--font-header)', fontWeight: 600 }}
        >
          Choose a Resolution
        </Typography>

        <FormControl component="fieldset" sx={{ width: '100%' }}>
          <RadioGroup
            value={selectedResolution}
            onChange={handleResolutionChange}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5
              }}
            >
              {/* Auto-increment */}
              <Box
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: selectedResolution === 'auto_increment' ? 'primary.main' : 'divider',
                  borderRadius: 1.5,
                  backgroundColor: selectedResolution === 'auto_increment' ? 'primary.light' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => setSelectedResolution('auto_increment')}
              >
                <FormControlLabel
                  value="auto_increment"
                  control={<Radio />}
                  label={
                    <Box display="flex" alignItems="center" gap={1}>
                      <AddCircleOutlineIcon fontSize="small" />
                      <Box>
                        <Typography sx={{ fontFamily: 'var(--font-header)', fontWeight: 500 }}>
                          Auto-increment name
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                          Rename to "{generateAutoIncrementName(currentConflict.targetName)}"
                        </Typography>
                      </Box>
                    </Box>
                  }
                  sx={{ m: 0, width: '100%' }}
                />
              </Box>

              {/* Custom rename */}
              <Box
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: selectedResolution === 'rename' ? 'primary.main' : 'divider',
                  borderRadius: 1.5,
                  backgroundColor: selectedResolution === 'rename' ? 'primary.light' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => setSelectedResolution('rename')}
              >
                <FormControlLabel
                  value="rename"
                  control={<Radio />}
                  label={
                    <Box display="flex" alignItems="center" gap={1}>
                      <DriveFileRenameOutlineIcon fontSize="small" />
                      <Box>
                        <Typography sx={{ fontFamily: 'var(--font-header)', fontWeight: 500 }}>
                          Custom rename
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                          Specify a new name for this file
                        </Typography>
                      </Box>
                    </Box>
                  }
                  sx={{ m: 0, width: '100%' }}
                />
                {selectedResolution === 'rename' && (
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Enter new name..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    sx={{
                      mt: 2,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 1.5,
                        backgroundColor: 'background.paper'
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </Box>

              {/* Skip */}
              <Box
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: selectedResolution === 'skip' ? 'primary.main' : 'divider',
                  borderRadius: 1.5,
                  backgroundColor: selectedResolution === 'skip' ? 'primary.light' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => setSelectedResolution('skip')}
              >
                <FormControlLabel
                  value="skip"
                  control={<Radio />}
                  label={
                    <Box display="flex" alignItems="center" gap={1}>
                      <SkipNextIcon fontSize="small" />
                      <Box>
                        <Typography sx={{ fontFamily: 'var(--font-header)', fontWeight: 500 }}>
                          Skip this file
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                          Don't move or rename this file
                        </Typography>
                      </Box>
                    </Box>
                  }
                  sx={{ m: 0, width: '100%' }}
                />
              </Box>

              {/* Merge (for folders) */}
              {currentConflict.isDirectory && (
                <Box
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: selectedResolution === 'merge' ? 'primary.main' : 'divider',
                    borderRadius: 1.5,
                    backgroundColor: selectedResolution === 'merge' ? 'primary.light' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => setSelectedResolution('merge')}
                >
                  <FormControlLabel
                    value="merge"
                    control={<Radio />}
                    label={
                      <Box display="flex" alignItems="center" gap={1}>
                        <MergeIcon fontSize="small" />
                        <Box>
                          <Typography sx={{ fontFamily: 'var(--font-header)', fontWeight: 500 }}>
                            Merge folders
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                            Combine contents of both folders
                          </Typography>
                        </Box>
                      </Box>
                    }
                    sx={{ m: 0, width: '100%' }}
                  />
                </Box>
              )}
            </Box>
          </RadioGroup>
        </FormControl>

        {/* Apply to all checkbox */}
        {totalConflicts > 1 && currentIndex < totalConflicts - 1 && (
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Typography sx={{ fontFamily: 'var(--font-body)' }}>
                  Apply this resolution to all remaining conflicts ({totalConflicts - currentIndex - 1} remaining)
                </Typography>
              }
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        {totalConflicts > 1 && (
          <>
            <Button
              onClick={handleSkipAll}
              color="inherit"
              sx={{ fontFamily: 'var(--font-header)' }}
            >
              Skip All
            </Button>
            <Button
              onClick={handleAutoIncrementAll}
              color="inherit"
              sx={{ fontFamily: 'var(--font-header)' }}
            >
              Auto-rename All
            </Button>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={onClose}
          color="inherit"
          sx={{ fontFamily: 'var(--font-header)' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleApplyResolution}
          variant="contained"
          disabled={selectedResolution === 'rename' && !customName.trim()}
          sx={{ fontFamily: 'var(--font-header)' }}
        >
          {currentIndex < totalConflicts - 1 && !applyToAll ? 'Next' : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConflictResolutionDialog;
