import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import EditIcon from '@mui/icons-material/Edit';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import RefreshIcon from '@mui/icons-material/Refresh';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HistoryIcon from '@mui/icons-material/History';
import { FileRename } from '../electron';
import { useRenameTemplates, RenameTemplate, applyTemplate } from '../hooks/useRenameTemplates';

interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  suggestions?: { renames: FileRename[] };
  loading: boolean;
  error?: string;
  onApply: (suggestions: { renames: FileRename[] }) => void;
  onRefresh?: () => void;
  selectedFiles?: string[]; // For template-based renaming
}

const EMPTY_SELECTED_FILES: string[] = [];

const RenameDialog: React.FC<RenameDialogProps> = ({
  open,
  onClose,
  suggestions,
  loading,
  error,
  onApply,
  onRefresh,
  selectedFiles = EMPTY_SELECTED_FILES,
}) => {
  const theme = useTheme();
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    currentFile?: string;
    status?: string;
  }>({ current: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<'ai' | 'templates'>('ai');
  const [selectedTemplate, setSelectedTemplate] = useState<RenameTemplate | null>(null);
  const [templatePreview, setTemplatePreview] = useState<{ original: string; renamed: string }[]>([]);
  
  const { 
    allTemplates, 
    recentlyUsed, 
    markAsUsed 
  } = useRenameTemplates();

  // Update template preview when template or files change
  useEffect(() => {
    if (selectedTemplate && selectedFiles.length > 0) {
      const preview = applyTemplate(selectedTemplate, selectedFiles);
      setTemplatePreview(preview);
    } else {
      setTemplatePreview(prev => (prev.length === 0 ? prev : []));
    }
  }, [selectedTemplate, selectedFiles]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onRenameProgress((value: {
      current: number;
      total: number;
      currentFile?: string;
      status?: string;
    }) => {
      setProgress(value);
    });

    return () => {
      unsubscribe();
    };
  }, []);

const handleApply = () => {
    if (activeTab === 'ai' && suggestions) {
      setProgress({ current: 0, total: suggestions.renames.length });
      onApply(suggestions);
    } else if (activeTab === 'templates' && selectedTemplate && templatePreview.length > 0) {
      markAsUsed(selectedTemplate.id);
      const templateRenames: { renames: FileRename[] } = {
        renames: templatePreview.map(item => ({
          originalName: item.original,
          suggestedName: item.renamed,
          reason: `Applied template: ${selectedTemplate.name}`
        }))
      };
      setProgress({ current: 0, total: templateRenames.renames.length });
      onApply(templateRenames);
    }
  };

  const handleTemplateSelect = (template: RenameTemplate) => {
    setSelectedTemplate(template);
  };

  const getTemplateIcon = (iconName?: string) => {
    switch (iconName) {
      case 'CalendarToday':
        return <CalendarTodayIcon />;
      case 'FormatListNumbered':
        return <FormatListNumberedIcon />;
      default:
        return <TextFieldsIcon />;
    }
  };

  const renderProgress = () => {
    if (!progress.total) return null;

    const percentage = (progress.current / progress.total) * 100;
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
            {progress.status || `Processing file ${progress.current} of ${progress.total}`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
            {Math.round(percentage)}%
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={percentage} />
        {progress.currentFile && (
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ mt: 1, fontFamily: 'var(--font-body)' }}
          >
            Current file: {progress.currentFile}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        tabIndex: -1,
        sx: {
          borderRadius: 1,
          background: theme.palette.background.default,
          boxShadow: 'none',
          border: `1px solid ${theme.palette.divider}`,
          backgroundImage: 'none',
        }
      }}
    >
      <DialogTitle
        sx={{
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box display="flex" alignItems="center">
          <EditIcon sx={{ mr: 1.5, fontSize: 24, color: theme.palette.text.secondary }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontFamily: 'var(--font-header)', fontWeight: 600 }}>
            Rename Suggestions
          </Typography>
          {onRefresh && (
            <IconButton
              onClick={onRefresh}
              size="small"
              sx={{
                color: theme.palette.text.secondary,
                mr: 1,
                '&:hover': {
                  backgroundColor: theme.palette.action.hover,
                },
                animation: loading ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': {
                  '0%': {
                    transform: 'rotate(0deg)',
                  },
                  '100%': {
                    transform: 'rotate(360deg)',
                  },
                }
              }}
              disabled={loading}
              title={loading ? "Getting fresh suggestions..." : "Get new suggestions"}
            >
              <RefreshIcon />
            </IconButton>
          )}
          <IconButton onClick={onClose} size="small" sx={{ color: theme.palette.text.secondary }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
<DialogContent sx={{
        maxHeight: '70vh',
        overflow: 'hidden',
        p: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Tabs for AI vs Templates */}
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            minHeight: 48,
            px: 2,
            '& .MuiTab-root': {
              fontFamily: 'var(--font-header)',
              fontWeight: 600,
              minHeight: 48,
            }
          }}
        >
          <Tab 
            value="ai" 
            label="AI Suggestions" 
            icon={<AutoFixHighIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab 
            value="templates" 
            label="Templates" 
            icon={<TextFieldsIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
        </Tabs>

        <Box sx={{
          flex: 1,
          overflow: 'auto',
          p: 3,
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: theme.palette.primary.main + '40',
            borderRadius: 'var(--border-radius-small)',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: theme.palette.primary.main + '60',
          },
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.palette.primary.main}40 transparent`,
        }}>
          {activeTab === 'ai' ? (
            // AI Suggestions Tab
            <>
              {loading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
                  <CircularProgress sx={{ mb: 2 }} />
                  <Typography sx={{ fontFamily: 'var(--font-body)' }}>
                    {suggestions ? 'Generating fresh rename suggestions...' : 'Analyzing files...'}
                  </Typography>
                  {renderProgress()}
                </Box>
              ) : error ? (
                <Alert severity="error" sx={{ mb: 2, fontFamily: 'var(--font-body)' }}>
                  {error}
                </Alert>
              ) : suggestions ? (
                <Box>
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    mb: 3,
                    p: 2,
                    backgroundColor: theme.palette.mode === 'dark'
                      ? theme.palette.action.selected
                      : theme.palette.action.hover,
                    borderRadius: 1,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      <AutoFixHighIcon sx={{ color: theme.palette.primary.main, mr: 1.5, flexShrink: 0 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body1" sx={{ fontFamily: 'var(--font-header)', color: theme.palette.text.primary, fontWeight: 700 }}>
                          AI has analyzed your files and suggests the following renames:
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'var(--font-body)', color: theme.palette.text.secondary }}>
                          Review every proposed filename before applying changes.
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      label={`${suggestions.renames.length} items`}
                      size="small"
                      variant="outlined"
                      sx={{ fontFamily: 'var(--font-body)', flexShrink: 0 }}
                    />
                  </Box>
                  
                  <Stack spacing={2} sx={{
                    maxHeight: '45vh',
                    overflow: 'auto',
                    pr: 1,
                    minHeight: 0,
                    flexShrink: 0,
                    '&::-webkit-scrollbar': {
                      width: '4px',
                    },
                    '&::-webkit-scrollbar-track': {
                      background: 'transparent',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      background: theme.palette.primary.main + '30',
                      borderRadius: 'var(--border-radius-small)',
                    },
                    '&::-webkit-scrollbar-thumb:hover': {
                      background: theme.palette.primary.main + '50',
                    },
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${theme.palette.primary.main}30 transparent`,
                  }}>
                    {suggestions.renames.map((rename, index) => (
                      <Card
                        key={index}
                        sx={{
                          borderRadius: 1.5,
                          border: `1px solid ${theme.palette.divider}`,
                          background: theme.palette.background.paper,
                          transition: 'background-color 0.16s ease, border-color 0.16s ease',
                          flexShrink: 0,
                          minHeight: 'auto',
                          '&:hover': {
                            backgroundColor: theme.palette.action.hover,
                            borderColor: theme.palette.divider,
                          }
                        }}
                      >
                        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                            <Box sx={{
                              p: 1.5,
                              borderRadius: 1.5,
                              backgroundColor: theme.palette.mode === 'dark'
                                ? `${theme.palette.primary.main}30`
                                : `${theme.palette.primary.main}20`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <InsertDriveFileIcon sx={{ color: theme.palette.primary.main, fontSize: 24 }} />
                            </Box>
                            
                            <Box sx={{ flex: 1 }}>
                              <Typography
                                variant="h6"
                                sx={{
                                  fontFamily: 'var(--font-body)',
                                  fontWeight: 500,
                                  color: theme.palette.text.primary,
                                  mb: 1
                                }}
                              >
                                {rename.originalName}
                              </Typography>
                              
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <TrendingFlatIcon sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
                                <Chip
                                  label={rename.suggestedName}
                                  sx={{
                                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                                    color: theme.palette.primary.contrastText,
                                    fontFamily: 'var(--font-body)',
                                    fontWeight: 500,
                                    '& .MuiChip-label': {
                                      px: 2,
                                      py: 0.5
                                    }
                                  }}
                                />
                              </Box>
                              
                              <Divider sx={{ my: 1.5, borderColor: `${theme.palette.primary.main}30` }} />
                              
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: 'var(--font-body)',
                                  color: theme.palette.text.secondary,
                                  fontStyle: 'italic',
                                  lineHeight: 1.5
                                }}
                              >
                                {rename.reason}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                  {renderProgress()}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
                  <Typography variant="body1" color="text.secondary" align="center" sx={{ fontFamily: 'var(--font-body)' }}>
                    {loading ? 'Generating fresh rename suggestions...' : 'No suggestions available'}
                  </Typography>
                  {loading && (
                    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                        Please wait while AI analyzes your files
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </>
          ) : (
            // Templates Tab
            <Box sx={{ display: 'flex', gap: 3, height: '100%' }}>
              {/* Template List */}
              <Box sx={{ width: '40%', display: 'flex', flexDirection: 'column' }}>
                {/* Recently Used */}
                {recentlyUsed.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <HistoryIcon sx={{ fontSize: 16, color: theme.palette.text.secondary, mr: 0.5 }} />
                      <Typography variant="caption" sx={{ fontFamily: 'var(--font-header)', color: theme.palette.text.secondary, fontWeight: 600 }}>
                        Recently Used
                      </Typography>
                    </Box>
                    <List dense sx={{ py: 0 }}>
                      {recentlyUsed.slice(0, 3).map((template) => (
                        <ListItem key={template.id} disablePadding>
                          <ListItemButton
                            selected={selectedTemplate?.id === template.id}
                            onClick={() => handleTemplateSelect(template)}
                            sx={{
                              borderRadius: 1,
                              mb: 0.5,
                              '&.Mui-selected': {
                                backgroundColor: `${theme.palette.primary.main}20`,
                                borderLeft: `3px solid ${theme.palette.primary.main}`,
                              }
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              {getTemplateIcon(template.icon)}
                            </ListItemIcon>
                            <ListItemText 
                              primary={template.name}
                              primaryTypographyProps={{ 
                                variant: 'body2',
                                sx: { fontFamily: 'var(--font-body)', fontWeight: 500 }
                              }}
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                    <Divider sx={{ my: 1 }} />
                  </Box>
                )}

                {/* All Templates */}
                <Typography variant="caption" sx={{ fontFamily: 'var(--font-header)', color: theme.palette.text.secondary, fontWeight: 600, mb: 1 }}>
                  All Templates
                </Typography>
                <List dense sx={{ 
                  py: 0, 
                  flex: 1, 
                  overflow: 'auto',
                  '&::-webkit-scrollbar': { width: '4px' },
                  '&::-webkit-scrollbar-thumb': { background: theme.palette.primary.main + '30', borderRadius: 'var(--border-radius-small)' },
                }}>
                  {allTemplates.map((template) => (
                    <Tooltip key={template.id} title={template.description} placement="right">
                      <ListItem disablePadding>
                        <ListItemButton
                          selected={selectedTemplate?.id === template.id}
                          onClick={() => handleTemplateSelect(template)}
                          sx={{
                            borderRadius: 1,
                            mb: 0.5,
                            '&.Mui-selected': {
                              backgroundColor: `${theme.palette.primary.main}20`,
                              borderLeft: `3px solid ${theme.palette.primary.main}`,
                            }
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            {getTemplateIcon(template.icon)}
                          </ListItemIcon>
                          <ListItemText 
                            primary={template.name}
                            secondary={template.description}
                            primaryTypographyProps={{ 
                              variant: 'body2',
                              sx: { fontFamily: 'var(--font-body)', fontWeight: 500 }
                            }}
                            secondaryTypographyProps={{
                              variant: 'caption',
                              sx: { 
                                fontFamily: 'var(--font-body)',
                                display: '-webkit-box',
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }
                            }}
                          />
                        </ListItemButton>
                      </ListItem>
                    </Tooltip>
                  ))}
                </List>
              </Box>

              {/* Preview */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Typography variant="caption" sx={{ fontFamily: 'var(--font-header)', color: theme.palette.text.secondary, fontWeight: 600, mb: 1 }}>
                  Preview
                </Typography>
                
                {selectedTemplate ? (
                  <Box sx={{
                    flex: 1,
                    p: 2,
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 1.5,
                    border: `1px solid ${theme.palette.divider}`,
                    overflow: 'auto'
                  }}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontFamily: 'var(--font-header)', fontWeight: 600, mb: 0.5 }}>
                        {selectedTemplate.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                        {selectedTemplate.description}
                      </Typography>
                    </Box>
                    
                    <Divider sx={{ my: 2 }} />
                    
                    {selectedFiles.length === 0 ? (
                      <Alert severity="info" sx={{ fontFamily: 'var(--font-body)' }}>
                        Select files in the directory explorer to preview rename results
                      </Alert>
                    ) : (
                      <Stack spacing={1}>
                        {templatePreview.slice(0, 10).map((item, index) => (
                          <Box key={index} sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1,
                            p: 1,
                            backgroundColor: theme.palette.background.paper,
                            borderRadius: 1,
                            border: `1px solid ${theme.palette.divider}`
                          }}>
                            <InsertDriveFileIcon sx={{ fontSize: 16, color: theme.palette.text.secondary }} />
                            <Typography variant="caption" sx={{ fontFamily: 'var(--font-body)', color: theme.palette.text.secondary }}>
                              {item.original}
                            </Typography>
                            <TrendingFlatIcon sx={{ fontSize: 14, color: theme.palette.primary.main }} />
                            <Chip 
                              label={item.renamed}
                              size="small"
                              sx={{ 
                                backgroundColor: `${theme.palette.primary.main}20`,
                                color: theme.palette.primary.main,
                                fontFamily: 'var(--font-body)',
                                fontSize: '0.7rem'
                              }}
                            />
                          </Box>
                        ))}
                        {templatePreview.length > 10 && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-body)', fontStyle: 'italic' }}>
                            ... and {templatePreview.length - 10} more files
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Box>
                ) : (
                  <Box sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 3,
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                    borderRadius: 1.5,
                    border: `1px dashed ${theme.palette.divider}`
                  }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                      Select a template to preview changes
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>
<DialogActions sx={{
        p: 2,
        gap: 1,
        backgroundColor: theme.palette.background.default,
        borderTop: `1px solid ${theme.palette.divider}`
      }}>
        <Button
          onClick={onClose}
          sx={{
            fontFamily: 'var(--font-header)',
            color: theme.palette.text.secondary,
            '&:hover': {
              backgroundColor: theme.palette.action.hover
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={
            activeTab === 'ai' 
              ? (loading || !suggestions)
              : (!selectedTemplate || selectedFiles.length === 0)
          }
          startIcon={activeTab === 'ai' ? <AutoFixHighIcon /> : <TextFieldsIcon />}
          sx={{
            fontFamily: 'var(--font-header)',
            borderRadius: 1.5,
            px: 3,
            py: 1,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none'
            },
            '&:disabled': {
              background: theme.palette.action.disabledBackground,
              color: theme.palette.action.disabled
            }
          }}
        >
          {activeTab === 'ai' ? 'Apply Suggestions' : `Apply Template${selectedFiles.length > 0 ? ` (${selectedFiles.length} files)` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RenameDialog;
